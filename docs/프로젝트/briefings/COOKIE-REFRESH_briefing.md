# COOKIE-REFRESH 브리핑

## 요약
NID_AUT 없음 감지 시 재로그인 로직 강화. 쿠키 로드 후 NID_AUT가 없으면 Supabase에서 최신 쿠키를 재로드하고, 워커에서도 로그인 성공 후 NID_AUT 존재 여부를 검증하여 1회 재시도.

## 변경 파일
- `src/auth/naver_login.py` -- ensure_login_cookie_only()에서 NID_AUT 없을 때 context.clear_cookies() 후 Supabase 재로드 1회 시도
- `command_worker.py` -- _login() 내부에 _verify_nid_aut() 추가, 로그인 성공 후 NID_AUT 검증 + 없으면 1회 재시도

## 기술 결정
- **재시도 1회 제한**: 무한 재시도 방지. NID_AUT가 실제로 Supabase에 없는 경우(웹에서 재업로드 필요) 빠르게 포기
- **context.clear_cookies()**: 기존 만료 쿠키가 남아있을 수 있으므로 초기화 후 재로드
- **admin(ID/PW) 경로도 보호**: ensure_login() 성공 후에도 NID_AUT 검증 추가. 로그인 성공했지만 httpOnly 쿠키가 드롭되는 경우 대비
- **대안**: 쿠키 파일에서 NID_AUT만 별도 저장 -> 복잡성 증가 대비 이점 낮음

## 테스트 결과
- 구문 검증: naver_login.py, command_worker.py 모두 통과
- 실 환경 테스트는 브라우저 + 네이버 로그인 필요 (다음 execute 명령 실행 시 확인)

## 남은 작업 / 주의사항
- NID_AUT 재로드 실패 시 텔레그램 알림 추가 검토
- 쿠키 만료 주기 모니터링 (현재 어제 밤 성공 -> 오늘 아침 실패 패턴)

## 핵심 코드 변경

### ensure_login_cookie_only() NID_AUT 재로드
```python
# before
if not has_nid_aut:
    logger.warning("NID_AUT 없음 -- 웹에서 재업로드 필요")
    return False

# after
if not has_nid_aut:
    logger.warning("NID_AUT 없음 -- Supabase에서 최신 쿠키 재로드 시도")
    await context.clear_cookies()
    retry_loaded = await _load_cookies_for_user(context, user_id)
    if retry_loaded:
        all_cookies = await context.cookies()
        has_nid_aut = any(c["name"] == "NID_AUT" for c in all_cookies)
    if not has_nid_aut:
        return False
```

### command_worker _login() NID_AUT 검증
```python
# before
async def _login(context, page):
    return await ensure_login_cookie_only(context, page, user_id)

# after
async def _verify_nid_aut(context) -> bool:
    all_cookies = await context.cookies()
    return any(c["name"] == "NID_AUT" for c in all_cookies)

async def _login(context, page):
    logged_in = await ensure_login_cookie_only(context, page, user_id)
    if logged_in and not await _verify_nid_aut(context):
        logger.warning("로그인 성공했으나 NID_AUT 없음 -- 1회 재시도")
        logged_in = await ensure_login_cookie_only(context, page, user_id)
    return logged_in
```

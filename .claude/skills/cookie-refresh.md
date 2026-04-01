# 네이버 쿠키 갱신 스킬 (cookie-refresh)

> **트리거**: 아래 표현이 나오면 이 스킬을 즉시 실행한다.
> - "쿠키 갱신" / "쿠키 리프레시" / "쿠키 동기화"
> - "로그인 만료" / "로그인 실패"
> - `bot-health-check`에서 쿠키 만료 감지 시

---

## 배경

네이버 쿠키(NID_AUT 등)가 만료되면 댓글 봇과 게시 발행이 모두 중단된다.
**Supabase 양방향 동기화**(Command Queue 패턴)로 로컬과 웹앱 간 쿠키를 공유하므로, 갱신 시 양쪽 모두 반영해야 한다.

---

## 실행 순서 (순서 준수 필수)

### STEP 1 — 현재 쿠키 상태 확인

```bash
cd /home/window11/insung_blog
source .venv/bin/activate

# 로컬 쿠키 파일 확인
ls -la cookies/

# 만료 시각 확인
python3 -c "
import json, time
for c in json.load(open('cookies/naver_cookies.json')):
    if c.get('name') in ('NID_AUT', 'NID_SES'):
        exp = c.get('expires', 0)
        remain = (exp - time.time()) / 3600
        status = f'{remain:.0f}h 남음' if remain > 0 else '만료됨'
        print(f\"{c['name']}: {status}\")
" 2>/dev/null
```

### STEP 2 — Headed 브라우저 로그인

만료됐으면 headed 모드로 네이버 로그인을 수행한다:

```bash
cd /home/window11/insung_blog
source .venv/bin/activate
python -c "
from src.auth.naver_login import NaverLogin
import asyncio
asyncio.run(NaverLogin(headless=False).login())
"
```

**수동 개입 필요**:
1. 브라우저 창이 열림
2. 네이버 로그인 페이지 자동 이동
3. **ID/PW 자동 입력 또는 수동 입력** (2FA가 뜨면 수동)
4. 로그인 성공 → 쿠키 자동 저장

### STEP 3 — 로컬 쿠키 저장 확인

```bash
cd /home/window11/insung_blog
python3 -c "
import json, time
for c in json.load(open('cookies/naver_cookies.json')):
    if c.get('name') in ('NID_AUT', 'NID_SES'):
        exp = c.get('expires', 0)
        remain = (exp - time.time()) / 3600
        print(f\"{c['name']}: {remain:.0f}h 남음\")
"
```

NID_AUT가 갱신됐는지 확인 (보통 720h = 30일).

### STEP 4 — Supabase 양방향 동기화

로컬 쿠키를 Supabase에 업로드하여 웹앱에서도 사용 가능하게 한다:

```bash
cd /home/window11/insung_blog
source .venv/bin/activate
python -c "
from src.storage.database import Database
db = Database()
db.sync_cookies_to_supabase()
"
```

또는 웹앱 제어판에서 수동 트리거:
- `insungblog.vercel.app` → 봇 제어 → "쿠키 동기화" 버튼

### STEP 5 — 검증

```bash
cd /home/window11/insung_blog
source .venv/bin/activate
python main.py --run-once --dry-run
```

dry-run에서 "로그인 성공" 확인.

### STEP 6 — 결과 보고

```
쿠키 갱신 — {날짜}

| 항목 | 상태 |
|------|------|
| NID_AUT | 갱신 완료 (720h 남음) |
| NID_SES | 갱신 완료 |
| 로컬 저장 | cookies/naver_cookies.json |
| Supabase 동기화 | 업로드 완료 |
| dry-run 검증 | 로그인 성공 |
```

---

## 판단 규칙

| 상황 | 행동 |
|------|------|
| NID_AUT 48h+ 남음 | "아직 유효, 갱신 불필요" 알림 |
| NID_AUT 48h 미만 | 갱신 권장 |
| NID_AUT 만료 | 즉시 갱신 필수 |
| 2FA 팝업 발생 | 사용자에게 수동 인증 요청 |
| 로그인 후에도 쿠키 없음 | `naver_login.py` 쿠키 저장 로직 점검 |
| Supabase 동기화 실패 | `.env` SUPABASE 키 확인 |

---

## 주의사항

- headed 모드 필수 — headless로는 네이버 봇 감지에 걸릴 수 있음
- 2FA(2단계 인증) 활성화 시 수동 개입 필요
- 쿠키 파일(`cookies/`)은 `.gitignore`에 포함 — 커밋 금지
- Supabase 동기화 후 웹앱 측 반영까지 최대 1분 소요
- 이 스킬은 **사용자 주도**로 실행 (자동 실행 금지 — 로그인 행위이므로)

# DUPLICATE-FIX 브리핑

## 요약
중복 댓글 근본 원인 4가지에 대한 다층 방어 구현. 기존 중복 데이터 237건 정리 + 4단계 방어 코드 적용.

## 변경 파일
- `tools/fix_duplicate_comments.py` -- 기존 중복 데이터 정리 스크립트 (154그룹, 237건 rejected 처리)
- `src/storage/supabase_client.py` -- add_pending_comment_sb()에 INSERT 전 (post_url, user_id) 중복 사전 체크 추가
- `src/storage/database.py` -- is_post_commented()에 Supabase pending_comments 동시 체크 추가
- `command_worker.py` -- approved 목록에서 post_url 기준 중복 제거 후 게시
- `supabase/migrations/20260329_add_unique_pending_comments.sql` -- partial UNIQUE index SQL (수동 실행 필요)
- `tests/test_duplicate_prevention.py` -- is_post_commented Supabase 연동 테스트 5건 추가/수정

## 기술 결정
- **다층 방어 전략**: DB 레벨(UNIQUE) + 삽입 전(사전 체크) + 조회 시(이중 체크) + 게시 전(필터)
- **Supabase 체크 실패 시 graceful degradation**: 네트워크 오류 등으로 Supabase 조회 실패하면 경고 로그만 남기고 SQLite 결과만 사용 (가용성 우선)
- **Partial UNIQUE index**: `WHERE status IN ('pending', 'approved', 'posted')` 조건으로 rejected/failed는 같은 post_url 허용 (재시도 가능)
- **데이터 정리 방식**: DELETE 대신 status='rejected' + fail_reason='중복 자동 제거'로 변경 (데이터 보존)

## 테스트 결과
- 구문 검증: 수정 4개 파일 + 테스트 파일 모두 통과
- fix_duplicate_comments.py dry-run: 154그룹 237건 제거 대상 확인
- fix_duplicate_comments.py 실행: 237건 전부 rejected 처리 완료
- pytest TestIsPostCommented: 5건 전부 통과

## 남은 작업 / 주의사항
- **마이그레이션 SQL 수동 실행 필요**: `supabase/migrations/20260329_add_unique_pending_comments.sql`을 Supabase Dashboard SQL Editor에서 실행
- 기존 테스트 중 TestFillAndSubmit, TestRetryQueue, TestHandleExecute는 기존부터 실패 (시그니처 변경 등)

## 핵심 코드 변경

### add_pending_comment_sb() 중복 사전 체크
```python
# before
result = sb.table("pending_comments").insert(row).execute()

# after
existing = (
    sb.table("pending_comments")
    .select("id, status")
    .eq("user_id", uid).eq("post_url", post_url)
    .in_("status", ["pending", "approved"])
    .limit(1).execute()
)
if existing.data:
    return existing.data[0]["id"]  # 기존 id 반환
result = sb.table("pending_comments").insert(row).execute()
```

### is_post_commented() Supabase 이중 체크
```python
# before
return row is not None  # SQLite만

# after
if row is not None:
    return True
# Supabase pending/approved/posted 추가 체크
result = sb.table("pending_comments").select("id", count="exact") \
    .eq("user_id", uid).eq("post_url", post_url) \
    .in_("status", ["pending", "approved", "posted"]).execute()
return (result.count or 0) > 0
```

### command_worker 게시 전 중복 제거
```python
# before
for i, comment in enumerate(approved, 1):
    # 중복 post_url도 그냥 게시

# after
seen_urls: set[str] = set()
for comment in approved:
    if comment["post_url"] not in seen_urls:
        unique_approved.append(comment)
        seen_urls.add(comment["post_url"])
    else:
        update_pending_status_sb(comment["id"], "rejected", ...)
```

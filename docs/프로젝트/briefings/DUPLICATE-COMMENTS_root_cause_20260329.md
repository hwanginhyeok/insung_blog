# 중복 댓글 근본 원인 분석 리포트

**작성일**: 2026-03-29
**분석 대상**: `pending_comments` 테이블 중복 발생 원인
**심각도**: 🔴 HIGH — 실제 사용자 블로그에 중복 댓글 게시됨

---

## 실제 피해 현황

| 항목 | 수치 |
|------|------|
| `pending_comments` 전체 레코드 | 810건 |
| 중복 `(post_url, user_id)` 쌍 | **154개** |
| 영향받은 레코드 수 | **약 420건** |
| 중복 5건 이상 | 3쌍 (실제로 같은 글에 5번 댓글) |
| 중복 4건 | 12쌍 |

---

## 근본 원인 (우선순위 순)

### 🔴 원인 1: Supabase `pending_comments` UNIQUE 제약 없음 (확률 95%)

**문제**: `pending_comments` 테이블에 `UNIQUE(post_url, user_id)` 제약이 없어서 동일 게시물에 대해 여러 행 삽입이 무방비로 허용됨.

**코드 위치**: `src/storage/supabase_client.py:add_pending_comment_sb()` (281-318행)
```python
result = sb.table("pending_comments").insert(row).execute()  # 중복 체크 없이 바로 INSERT
```

**실제 증거**:
```
id=772d8a80 | status=posted | 2026-03-16 13:22
id=009e7426 | status=posted | 2026-03-17 14:03  ← 1일 뒤 같은 글에 또 등록
id=e3c67f73 | status=posted | 2026-03-22 01:32  ← 5일 뒤에 또 등록
(동일 post_url, 동일 user_id)
```

---

### 🔴 원인 2: `is_post_commented()` SQLite만 체크 (확률 90%)

**문제**: 중복 방지 함수가 SQLite `comment_history`(로컬)만 확인하고, Supabase `pending_comments`의 pending/approved/posted 상태를 무시함.

**코드 위치**: `src/storage/database.py:168-179`
```python
def is_post_commented(post_url: str, user_id: str | None = None) -> bool:
    with _conn(user_id) as conn:
        row = conn.execute(
            "SELECT 1 FROM comment_history WHERE post_url = ? AND success = 1",
            (post_url,),
        ).fetchone()
    return row is not None
    # ← Supabase pending/approved/posted 상태 확인 없음!
```

**발생 시나리오**:
1. `orchestrator.py`가 `is_post_commented(A)` → False (SQLite에 없음)
2. `add_pending_comment_sb(A)` → Supabase에 pending 상태로 삽입
3. 다음 실행에서 `is_post_commented(A)` → 또 False (SQLite에 아직 없음)
4. `add_pending_comment_sb(A)` → 또 삽입 → 중복!

---

### 🟠 원인 3: Check-Then-Act 레이스 컨디션 (확률 70%)

**문제**: `is_post_commented()` 체크 후 `add_pending_comment_sb()` 호출 사이에 `await`가 있어서, 병렬 실행 중인 다른 루틴이 동시에 같은 post_url을 "미댓글"로 판단함.

**코드 위치**: `src/orchestrator.py:268-354`
```python
# 268-269: Check
eligible = [(url, title) for url, title in posts
            if not is_post_commented(url, user_id=user_id)]

# ... AI 댓글 생성 (수초 소요, await 다수) ...

# 348-354: Act (이미 다른 루틴이 삽입했을 수 있음)
add_pending_comment_sb(blog_id=bid, post_url=data["url"], ...)
```

**병렬 실행 경로**: `asyncio.gather()`로 `_visit_one()` 여러 개 동시 실행 (orchestrator.py:401)

---

### 🟠 원인 4: `command_worker.py` 게시 중 중복 제거 없음 (확률 30%)

**문제**: approved 목록 조회 후 같은 `post_url`의 댓글이 여러 개 있어도 모두 게시함.

**코드 위치**: `command_worker.py:252-376`
```python
approved = get_pending_comments_sb("approved", user_id=user_id)
# post_url 중복 제거 로직 없음
for i, comment in enumerate(approved, 1):
    ok, _ = await write_comment(...)  # 중복 post_url도 그냥 게시
```

---

## 해결 방안

### 방안 A: Supabase UNIQUE 제약 추가 (마이그레이션 필요)
```sql
-- 기존 중복 정리 후 제약 추가
DELETE FROM pending_comments WHERE id NOT IN (
  SELECT DISTINCT ON (post_url, user_id) id
  FROM pending_comments
  ORDER BY post_url, user_id,
    CASE status WHEN 'posted' THEN 0 WHEN 'approved' THEN 1
                WHEN 'pending' THEN 2 ELSE 3 END,
    created_at DESC
);

ALTER TABLE pending_comments
ADD CONSTRAINT uq_pending_post_user UNIQUE (post_url, user_id);
```

### 방안 B: `is_post_commented()` Supabase 동시 체크
```python
def is_post_commented(post_url: str, user_id: str | None = None) -> bool:
    # 1. SQLite 체크
    with _conn(user_id) as conn:
        if conn.execute("SELECT 1 FROM comment_history WHERE post_url=? AND success=1",
                        (post_url,)).fetchone():
            return True
    # 2. Supabase 체크 (pending/approved/posted 모두 포함)
    result = sb.table("pending_comments").select("id", count="exact") \
               .eq("user_id", uid).eq("post_url", post_url) \
               .in_("status", ["pending", "approved", "posted"]).execute()
    return (result.count or 0) > 0
```

### 방안 C: `add_pending_comment_sb()` 중복 사전 체크
```python
def add_pending_comment_sb(...) -> str | None:
    # INSERT 전 중복 확인
    existing = sb.table("pending_comments").select("id, status") \
                 .eq("user_id", uid).eq("post_url", post_url) \
                 .in_("status", ["pending", "approved"]).limit(1).execute()
    if existing.data:
        logger.warning(f"중복 방지: {post_url[:60]} 이미 대기/승인 중")
        return existing.data[0]["id"]
    # ... INSERT
```

### 방안 D: `command_worker.py` 게시 전 중복 제거
```python
# post_url 기준 첫 번째만 유지, 나머지 rejected 처리
seen_urls = set()
unique_approved = []
for comment in approved:
    if comment["post_url"] not in seen_urls:
        unique_approved.append(comment)
        seen_urls.add(comment["post_url"])
    else:
        update_pending_status_sb(comment["id"], "rejected", fail_reason="중복 자동 제거")
approved = unique_approved
```

### 방안 E: 기존 중복 데이터 정리 스크립트
- `tools/fix_duplicate_comments.py` 생성
- 154개 중복 쌍에서 `posted > approved > pending` 우선순위로 1개만 유지
- 나머지 rejected 처리

---

## 야간 작업 수행 목록

1. **방안 E** — 기존 중복 데이터 정리 스크립트 작성 + 실행 (dry-run 먼저)
2. **방안 C** — `add_pending_comment_sb()` 중복 사전 체크 추가
3. **방안 B** — `is_post_commented()` Supabase 동시 체크
4. **방안 D** — `command_worker.py` 게시 전 중복 제거
5. **방안 A** — Supabase 마이그레이션 SQL 파일 생성 (실행은 수동)

---

## 수정 후 기대 효과

| 방안 | 차단율 | 비고 |
|------|--------|------|
| A (UNIQUE 제약) | 100% | DB 레벨 최종 방어 |
| B (Supabase 체크) | ~90% | 레이스 윈도우 축소 |
| C (사전 체크) | ~85% | INSERT 전 방어 |
| D (게시 중 제거) | ~70% | 마지막 게이트 |
| 전체 적용 시 | **~100%** | 다층 방어 |

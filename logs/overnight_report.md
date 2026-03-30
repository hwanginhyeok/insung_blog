# 야간 자동 작업 보고서

> 실행일: 2026-03-30

---

## 완료한 작업 (3/3)

| # | 작업 | 커밋 | 브리핑 |
|---|------|------|--------|
| 8 | DUPLICATE-FIX (중복 댓글 다층 방어) | `fa7ac64` | [DUPLICATE-FIX_briefing.md](../docs/프로젝트/briefings/DUPLICATE-FIX_briefing.md) |
| 9 | COOKIE-REFRESH (NID_AUT 재로그인 강화) | `551fe7f` | [COOKIE-REFRESH_briefing.md](../docs/프로젝트/briefings/COOKIE-REFRESH_briefing.md) |
| 10 | FAIL-FAST (입력창 탐색 타임아웃 최적화) | `2dbaaf9` | [FAIL-FAST_briefing.md](../docs/프로젝트/briefings/FAIL-FAST_briefing.md) |

## 스킵한 작업 (0건)

없음. 작업 1~7은 이전 야간작업(2026-03-22)에서 이미 완료.

---

## 작업 8: DUPLICATE-FIX

### 요약
pending_comments에 154개 중복 쌍(420건) 존재. 4단계 다층 방어 구현.

### 변경사항
| 단계 | 파일 | 내용 |
|------|------|------|
| 8-1 | `tools/fix_duplicate_comments.py` | 기존 중복 237건 rejected 처리 |
| 8-2 | `src/storage/supabase_client.py` | add_pending_comment_sb() INSERT 전 (post_url, user_id) 중복 체크 |
| 8-3 | `src/storage/database.py` | is_post_commented() SQLite + Supabase 이중 체크 |
| 8-4 | `command_worker.py` | approved 목록에서 post_url 기준 중복 제거 후 게시 |
| 8-5 | `supabase/migrations/` | UNIQUE partial index SQL 작성 (수동 실행 필요) |
| 8-6 | `tests/test_duplicate_prevention.py` | is_post_commented 테스트 5건 추가, 전부 통과 |

### 후속: `supabase/migrations/20260329_add_unique_pending_comments.sql` 수동 실행 필요

---

## 작업 9: COOKIE-REFRESH

### 요약
NID_AUT 없음 감지 시 Supabase에서 최신 쿠키 재로드 + 워커에서 로그인 후 NID_AUT 검증 + 1회 재시도.

### 변경사항
| 파일 | 내용 |
|------|------|
| `src/auth/naver_login.py` | ensure_login_cookie_only()에서 NID_AUT 없으면 clear_cookies() 후 재로드 |
| `command_worker.py` | _verify_nid_aut() 추가, 로그인 후 NID_AUT 없으면 1회 재시도 |

---

## 작업 10: FAIL-FAST

### 요약
댓글 입력창 없는 게시물에서 ~70초 -> ~20초로 탐색 시간 최적화.

### 변경사항
| 파일 | 내용 |
|------|------|
| `src/commenter/comment_writer.py` | _find_comment_input() 주력 10초 + 폴백 2초 타임아웃 |

---

## 발견한 이슈

| 이슈 | 심각도 | 상태 |
|------|--------|------|
| 기존 테스트(TestFillAndSubmit, TestRetryQueue 등) 시그니처 불일치로 실패 | 중간 | 미수정 (이번 작업 범위 아님) |
| "입력창 없음" 블로거 반복 실패 방지 로직 없음 | 낮음 | 향후 검토 |

## 다음에 해야 할 것

1. `supabase/migrations/20260329_add_unique_pending_comments.sql` 수동 실행 (UNIQUE index 추가)
2. 기존 테스트 파일 시그니처 불일치 수정 (TestRetryQueue, TestHandleExecute 등)
3. "입력창 없음" 블로거 일정 기간 스킵 로직 검토
4. NID_AUT 재로드 실패 시 텔레그램 알림 추가

---

## 최종 서비스 상태

```
blog-api.service     Active: active (running) since 2026-03-29 18:55:53 KST
blog-worker.service  Active: active (running) since 2026-03-30 14:18:51 KST (재시작 완료)
blog-telegram.service Active: active (running) since 2026-03-29 18:55:53 KST
워커 프로세스 수: 1 (정상)
```

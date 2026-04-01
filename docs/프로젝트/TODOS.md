# TODOS — 이후 작업 목록

> /plan-eng-review에서 생성. 각 항목은 블로킹 선행 조건 포함.

---

## TODO-1: Supabase Edge Function 개발 환경 셋업

**What:** `supabase/functions/toss-webhook/` Edge Function 개발 환경 구성 (Deno 런타임 + `supabase functions serve`)

**Why:** 블록 3(토스페이 Webhook 수신 → 구독 상태 갱신)은 Supabase Edge Function이 유일한 WSL2-안전 수신 방법. 현재 Edge Function 코드가 프로젝트에 없음. 착수 전에 WSL2에서 `supabase functions serve` 동작 확인이 선행 조건.

**Pros:** WSL2 로컬 서버에 HTTPS 공인 주소 없이도 Webhook 수신 가능. 토스페이 프로덕션 Webhook 수신 구조 확립.

**Cons:** Deno + Supabase CLI 설치 추가 공수. 로컬 테스트는 `supabase functions serve` + ngrok 조합 필요.

**Context:** 블록 3의 결제 Webhook 수신 경로: 토스페이 → Supabase Edge Function → `users.subscription_status` 갱신. WSL2에서 FastAPI로 직접 수신 불가 (공인 HTTPS 없음). `apps/web/supabase/` 폴더에 `functions/` 디렉토리 신규 생성 필요.

**Depends on / blocked by:** 블록 3 Open Questions #2(결제 수단) 결정 후 착수.

---

## TODO-2: 월별 무료티어 한도 Supabase RPC

**What:** `check_monthly_free_tier_limit(p_user_id)` Supabase RPC 함수 설계 + 마이그레이션 작성

**Why:** 현재 `check_daily_bot_limit()`은 일일 단위. 블록 3의 무료티어 한도는 "월 실행 횟수" 기준으로 설계 문서에 명시. 이 두 개의 한도 개념이 충돌 없이 공존해야 함. 월 집계 쿼리 최적화도 필요 (`idx_bot_run_log_user` 재사용 가능).

**Pros:** 블록 3 착수 시 limit enforcement 코드가 이미 준비된 상태. 기존 패턴(`check_daily_bot_limit` RPC) 그대로 따라 구현 가능.

**Cons:** Supabase RPC = 마이그레이션 파일 + 테스트 추가 공수.

**Context:** `command_worker.py:40`의 `check_daily_bot_limit()` 함수와 동일한 패턴. `bot_run_log WHERE user_id = $uid AND run_at >= date_trunc('month', NOW())` 쿼리. `_RATE_LIMITED_COMMANDS` 집합과 연동 필요.

**Depends on / blocked by:** 블록 3 Open Questions #3(한도 기준) 결정 후 설계 확정.

---

## TODO-3: 네이버 블로그 일일 방문자 수 자동 수집

**What:** 네이버 모바일 통계 페이지(`m.blog.naver.com/BlogUserStatisticProxyAction.naver?...`)에서 Playwright로 일일 방문자 수 자동 수집 → `blog_stats.visit_count` 자동 기록

**Why:** 현재 `blog_stats.visit_count`는 유저 수동 입력. 자동 수집이 되면 ROI 대시보드 데이터 완성도가 올라가고 유저 이탈 감소. 수동 입력 = 까먹으면 데이터 공백.

**Pros:** 유저 입력 부담 제거. `data_source = 'scraped'` 컬럼으로 수동/자동 구분 가능. 기존 Playwright + 쿠키 인프라 재사용.

**Cons:** 네이버 모바일 통계 페이지 셀렉터 변경 리스크. 로그인 세션 필요 (기존 쿠키 활용). cron 스케줄 추가 공수.

**Context:** `blog_stats.data_source TEXT DEFAULT 'manual'` 컬럼이 이미 마이그레이션에 포함될 예정. 자동 수집 구현 시 `command_worker.py`에 `collect_blog_stats` 명령 핸들러 추가 + cron 또는 스케줄러 연동. 기존 `debug_blog.py` 패턴 참고.

**Depends on / blocked by:** 블록 1 구현 완료 후 착수 (테이블 스키마 확정 선행).

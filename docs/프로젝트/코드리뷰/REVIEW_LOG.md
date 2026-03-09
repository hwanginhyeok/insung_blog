# REVIEW_LOG — 코드리뷰 기록

> 최신순 기록. 새 항목을 위에 추가.

---

## 2026-03-09 — P3 확장 기능 보안 수정 (6건)

- **TASK**: P3 코드리뷰 후속 수정
- **변경 파일**: kakao/login/route.ts, kakao/callback/route.ts, naver/login/route.ts, naver/callback/route.ts, login/page.tsx, calendar/route.ts
- **이슈 요약**: Critical 1 / Major 0 / Minor 2 — 전건 수정

### 수정 내역

| # | 심각도 | 이슈 | 수정 |
|---|--------|------|------|
| 1 | Critical | OAuth redirect 파라미터 Open Redirect 취약점 | 4개 파일(kakao/naver login+callback) — `startsWith("/") && !startsWith("//")` 검증 추가 |
| 2 | Minor | OAuth 콜백 에러 메시지 로그인 페이지에 미표시 | login/page.tsx — `searchParams.get("error")`로 초기 에러 상태 설정 |
| 3 | Minor | Calendar PATCH 업데이트 필드 미제한 | calendar/route.ts — 화이트리스트 방식으로 허용 필드(topic, category, memo, status, planned_date)만 추출 |

- **타입 체크**: `tsc --noEmit` 통과 (exit code 0)
- **판정**: 전건 수정 완료

---

## 2026-03-08 — 댓글 봇 + 텔레그램 봇 재시작 (4건 수정)

- **TASK**: 봇 서비스 재시작
- **변경 파일**: telegram_bot_simple.py, src/commenter/comment_writer.py, api_server.py, scripts/start_services.sh
- **이슈 요약**: Critical 0 / Major 0 / Minor 0

### 수정 내역

| # | 분류 | 이슈 | 수정 |
|---|------|------|------|
| 1 | 기능 | `execute_approved()` 시뮬레이션 (random.random) | API 서버 `/comment/execute` HTTP 호출로 교체 |
| 2 | 기능 | `write_comment`에 승인된 댓글 전달 불가 | `comment_text` 선택 파라미터 추가 (하위 호환) |
| 3 | 기능 | `/comment/execute`에서 AI 새로 생성 | 승인된 `comment_text` 전달하도록 수정 |
| 4 | 인프라 | `start_services.sh`에 텔레그램 봇 누락 | telegram 창 추가, n8n 제거 |

- **서비스 기동 확인**: API 서버(8001), 텔레그램 봇 — 정상
- **판정**: 머지 가능

---

## 2026-03-08 — W4-03 실사용 테스트 + 버그 수정 (7건)

- **TASK**: W4-03
- **변경 파일**: middleware.ts, dashboard/page.tsx, write/page.tsx, bot/page.tsx, lib/tier.ts, api/generate/route.ts, api/regenerate/route.ts, 00008_reserve_generation_rpc.sql(신규)
- **이슈 요약**: Critical 0 / Major 0 / Minor 1 (checkUsage export 유지 — 향후 사용 가능)

### 수정 내역

| # | 심각도 | 이슈 | 수정 |
|---|--------|------|------|
| 1 | HIGH | `/persona`, `/bot` 미들웨어 미보호 | matcher에 추가 |
| 2 | HIGH | 미들웨어 `getSession()` → `getUser()` | JWT 서버 검증으로 전환 |
| 3 | MEDIUM | 사용량 카운트 레이스 컨디션 | `reserve_generation` RPC (FOR UPDATE 행 잠금) + rollback 패턴 |
| 4 | MEDIUM | Dashboard user_id 미필터 | 명시적 `.eq("user_id", user.id)` 추가 |
| 5 | LOW | 텍스트 복사 시 빈 줄 잔존 | `\n{3,}` → `\n\n` 정리 |
| 6 | LOW | 봇 일괄 승인 로딩 없음 | `bulkApproving` 상태 + 버튼 비활성화 |
| 7 | LOW | Dashboard status config 안전하지 않은 인덱싱 | 폴백 객체 추가 |

- **DB 마이그레이션**: `00008_reserve_generation_rpc.sql` SQL Editor 실행 완료
- **빌드 검증**: `next build` 성공 (타입 에러 0, 경고 2 — img 관련)
- **판정**: 머지 가능

---

## 2026-03-02 — 시스템 리스크 전수 점검 및 대응

- **TASK**: 리스크 대응 (C/H/M 전체)
- **변경 파일**: api_server.py, src/auth/naver_login.py, src/storage/database.py, src/orchestrator.py, src/utils/browser.py, save_cookies.py, src/commenter/comment_writer.py, src/commenter/ai_comment.py, .env.example
- **이슈 요약**: Critical 3 / High 5 / Medium 6 — 전건 수정

### Critical (즉시 수정)

| ID | 이슈 | 파일 | 수정 내용 |
|----|------|------|-----------|
| C-1 | API 서버 인증 없음 | api_server.py | Bearer 토큰 인증 추가 (`HTTPBearer` + `_verify_token` 의존성). `/health` 외 전체 엔드포인트 보호 |
| C-2 | 2FA/캡차 감지 없음 — 무한 재시도 | naver_login.py | `_detect_login_block()` 추가. URL 키워드 8종 + 페이지 콘텐츠 키워드 7종 매칭. `_LoginBlockedError` 발생 시 즉시 중단, 수동 로그인 안내 |
| C-3 | 이미지 경로 검증 없음 (경로 순회) | api_server.py | `_validate_image_paths()` 추가. `Path.resolve()` + 허용 디렉토리 화이트리스트 (프로젝트 루트, `/tmp`) |

### High (24h 내 수정)

| ID | 이슈 | 파일 | 수정 내용 |
|----|------|------|-----------|
| H-1 | 쿠키 파일 퍼미션 무방비 | naver_login.py | `os.chmod(COOKIES_PATH, 0o600)` — 소유자만 읽기/쓰기 |
| H-2 | 실패 댓글 재시도 불가 | database.py | `INSERT OR IGNORE` → 기존 레코드 확인 후 실패→성공 업데이트 허용 |
| H-3 | SQLite 동시 접근 오류 가능 | database.py | `PRAGMA journal_mode=WAL` + `timeout=10` 추가 |
| H-4 | 브라우저 리소스 누수 | api_server.py | `/publish` 엔드포인트에 `try/finally` 추가, 예외 시에도 `browser.close()` 보장 |
| H-5 | 연속 실패 시 무한 반복 | orchestrator.py | 서킷 브레이커 패턴 추가. 연속 5회 실패 시 세션 즉시 중단 |

### Medium (1주 내 수정)

| ID | 이슈 | 파일 | 수정 내용 |
|----|------|------|-----------|
| M-1 | User-Agent 구버전 | browser.py, save_cookies.py | Chrome/120 → Chrome/133 업데이트 |
| M-2 | 타이핑 딜레이 균일 분포 | comment_writer.py | `randint(30,80)` → `gauss(μ=55, σ=15, clamp 20~120)`. textarea 경로도 동일 적용 |
| M-3 | 읽기 시뮬레이션 너무 짧음 | comment_writer.py | 2~5초 → 약 15~45초. 스크롤 2회→3~5회 점진적 + 각 구간 3~8초 체류 |
| M-4 | 방문 순서 고정 패턴 | orchestrator.py | `random.shuffle(commenters)` 추가 — 매 실행마다 방문 순서 랜덤화 |
| M-5 | 로그인 딜레이 고정값 | naver_login.py | `time.sleep(0.3)` 등 → `random.uniform()` / `random.randint()` 범위값으로 전환 |
| M-6 | AI 댓글 톤 단일화 | ai_comment.py | 5가지 톤 변형 (따뜻함, 지적 호기심, 공감, 유머, 실용적) 매 호출 랜덤 선택. 핵심 규칙은 `_BASE_RULES`로 공통 유지 |

- **판정**: 전건 수정 완료, 구문 검증 통과 (8개 파일)

---

## 2026-03-02 — Phase 3/4 코드리뷰 (api_server + skill_manager)

- **TASK**: INF-1
- **변경 파일**: api_server.py, src/ai/skill_manager.py, .env.example
- **이슈 요약**: Critical 0 / Major 4 / Minor 5
- **조치**:
  - Major #1: `/publish` 브라우저 설정 인라인 → `create_browser()` 호출로 교체
  - Major #2: 미사용 import `PAGE_LOAD_TIMEOUT` 제거
  - Major #3: HTTPException에 예외 원문 노출 → 사용자 친화 메시지로 교체 (상세는 logger에만)
  - Major #4: `_count_feedback_rows()`의 `"첫 게시물"` 하드코딩 → 날짜 패턴(`YYYY-MM-DD`) 매칭으로 변경
  - Minor #6: `HASHTAG_AI_MODEL` 재사용 의도 주석 추가
  - Minor #9: .env.example 텔레그램 토큰 주석 해제
  - Minor #5(인증), #7(임시파일), #8(에러 노드): 별도 Task로 분리 (P3-7 등)
- **판정**: 전건 수정 완료, 머지 가능

---

## 2026-03-02 — Phase 2 코드리뷰 + 리팩토링

- **TASK**: P2 리뷰
- **변경 파일**: content_generator.py, publisher_main.py, blog_publisher.py, debug_publisher.py, orchestrator.py, src/utils/browser.py(신규)
- **이슈 요약**: Critical 0 / Major 3 / Minor 2
- **조치**:
  - Major #1: `import json` 함수 내부 → 모듈 상단으로 이동 (content_generator.py)
  - Major #2: 미사용 import `PAGE_LOAD_TIMEOUT` 제거 (publisher_main.py)
  - Major #3: 브라우저 설정 3곳 중복 → `src/utils/browser.py` 공통 유틸 추출 (publisher_main, debug_publisher, orchestrator)
  - Minor #1: `_find_by_text` return type `object` → `ElementHandle` (blog_publisher.py)
  - Minor #2: 미사용 import `json` 제거 (debug_publisher.py)
- **판정**: 전건 수정 완료, 머지 가능

---

## 2026-03-02 — Phase 2 게시물 발행 시스템 구현

- **TASK**: P2 전체 (settings.py 수정 + 6개 신규 파일)
- **변경 파일**: config/settings.py, debug_publisher.py, src/ai/content_generator.py, src/publisher/blog_publisher.py, src/storage/database.py, publisher_main.py
- **이슈 요약**: Critical 0 / Major 0 / Minor 0
- **조치**: 초기 구현, 구문 검증 통과. 실제 네이버 테스트 전이라 셀렉터 정확도 미확인
- **판정**: 머지 가능 (dry-run 테스트 선행 필요)
- **비고**: 셀렉터는 debug_publisher.py 실행 후 업데이트 예정

---

## 2026-03-02 — 코드 관리 체계 구축

- **TASK**: Infra (CLAUDE.md, TASK.md, coding-rules.md, workflow-rules.md, CODE_MAP.md)
- **변경 파일**: CLAUDE.md, docs/프로젝트/ 하위 5개 파일
- **이슈 요약**: Critical 0 / Major 0 / Minor 0
- **조치**: 이슈 없음 (문서 파일)
- **판정**: 머지 가능

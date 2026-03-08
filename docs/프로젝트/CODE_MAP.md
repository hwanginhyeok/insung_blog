# CODE_MAP — 코드베이스 지도

> 파일 추가/삭제/이동/역할 변경 시 반드시 갱신.
> 최종 갱신: 2026-03-08 (쿠키 업로드 기능 + bot_cookies 테이블)

---

## apps/web/ — 웹 플랫폼 (Next.js 14 + Supabase)

> GitHub: `hwanginhyeok/insung_blog` (dev 브랜치)
> 배포: Vercel (prj_wzdUWmNlYWbgHKvjQsYR2i9pKohP)

| 경로 | 역할 | 상태 |
|------|------|------|
| `app/layout.tsx` | 루트 레이아웃 (Geist 폰트, lang="ko") | ✅ |
| `app/page.tsx` | 랜딩 페이지 ("블로그 AI 파트너") | ✅ 스켈레톤 |
| `app/(auth)/login/page.tsx` | 로그인/회원가입 (Supabase Auth 연동) | ✅ |
| `app/(dashboard)/layout.tsx` | 대시보드 공유 레이아웃 (Header) | ✅ |
| `app/(dashboard)/dashboard/page.tsx` | 내 글 목록 (Supabase 연동, TG 뱃지, 상태 표시, **완료 글 클릭→write 이동**) | ✅ |
| `app/(dashboard)/write/page.tsx` | AI 글쓰기 에디터 (사진+메모+초안+재생성+저장+복사, **이탈 경고 3종**, **?id= 저장된 글 불러오기**) | ✅ |
| `app/(dashboard)/persona/page.tsx` | 페르소나 관리 UI — 블로그 분석 + 7카테고리 아코디언 + 항목 토글/삭제/추가 + **피드백 규칙 승인/히스토리** | ✅ |
| `app/(dashboard)/guide/page.tsx` | 사용법 가이드 — 3-Step 흐름 + 기능별 상세 + FAQ (서버 컴포넌트) | ✅ **신규** |
| `app/globals.css` | 글로벌 스타일 + 테마 변수 (light/dark) | ✅ |
| `middleware.ts` | 세션 갱신 + 보호 경로 리다이렉트 | ✅ |
| `components/nav/header.tsx` | 대시보드 헤더 (네비+로그아웃) | ✅ |
| `components/ui/` | shadcn/ui 컴포넌트 (button, card, input, textarea) | ✅ |
| `lib/supabase.ts` | 브라우저용 Supabase 클라이언트 | ✅ |
| `lib/supabase-server.ts` | 서버 컴포넌트용 Supabase 클라이언트 (쿠키 인증) | ✅ |
| `lib/supabase-admin.ts` | 관리자 전용 Supabase 클라이언트 (service_role) | ✅ |
| `lib/database.types.ts` | Supabase 테이블 TypeScript 타입 정의 (tier/usage 컬럼 포함) | ✅ 수동 |
| `lib/tier.ts` | 구독 티어 정의 + 원자적 사용량 예약/롤백 (`reserveUsage` RPC 기반, 서버 전용) | ✅ |
| `lib/hooks/use-user.ts` | 현재 사용자 프로필 + role 훅 (`useUser()` → `{ user, loading, isAdmin }`) | ✅ **신규** |
| `lib/ai/generate-post.ts` | AI 4단계 파이프라인 TS 포팅 (Vision → Category → Draft → Hashtags) + `regeneratePost()` 재생성 | ✅ |
| `lib/crawl/naver-blog.ts` | 네이버 블로그 크롤링 모듈 — cheerio 기반, HTML 메타데이터 추출 (`crawlBlog()`, `extractBlogId()`) | ✅ **신규** |
| `app/api/generate/route.ts` | AI 생성 API Route (POST /api/generate, getUser 인증, 티어 한도 체크) | ✅ |
| `app/api/regenerate/route.ts` | AI 재생성 API Route (POST /api/regenerate, 피드백 기반 수정, 티어 한도 체크, **피드백 DB 저장 + 패턴 분석 트리거**) | ✅ |
| `app/api/persona/crawl/route.ts` | 블로그 크롤링 API Route (POST, blogUrl → crawl → HTML 메타데이터 반환) | ✅ **신규** |
| `app/api/persona/analyze/route.ts` | AI 페르소나 분석 API Route (POST, 2-pass Sonnet → persona_items INSERT) | ✅ **신규** |
| `app/api/persona/feedback/route.ts` | 피드백 규칙 API Route — GET: 대기 규칙 + 히스토리 조회, POST: 규칙 승인/거절 | ✅ **신규** |
| `app/api/bot/cookies/route.ts` | 쿠키 업로드 API Route — GET: 상태, POST: 업로드(upsert), DELETE: 삭제 | ✅ **신규** |
| `lib/ai/analyze-persona.ts` | 페르소나 AI 분석 — 2-pass (콘텐츠 6카테고리 + 포맷팅), `analyzePersona()` | ✅ **신규** |
| `lib/ai/analyze-feedback.ts` | 피드백 패턴 분석 — Haiku 모델, 5건 배치 → 최대 3개 규칙 도출, `analyzeFeedbackPatterns()` | ✅ **신규** |
| `lib/render/naver-html.ts` | SmartEditor 호환 HTML 렌더러 — 인라인 CSS, 폰트 매핑, 볼드 마커, `renderToNaverHtml()` | ✅ **신규** |
| `lib/utils.ts` | cn() 유틸리티 (clsx + tailwind-merge) | ✅ |
| `supabase/config.toml` | Supabase 로컬 개발 설정 | ✅ |
| `supabase/migrations/00001_create_users.sql` | users + user_credentials 테이블 | ✅ 실행됨 |
| `supabase/migrations/00002_create_generation_queue.sql` | generation_queue + view | ✅ 실행됨 |
| `supabase/migrations/00003_enable_rls_and_storage_policies.sql` | RLS + Storage 정책 | ✅ 실행됨 |
| `supabase/migrations/00004_auth_user_trigger.sql` | Auth → public.users 자동 삽입 트리거 | ✅ 실행됨 |
| `supabase/migrations/00005_add_source_column.sql` | generation_queue에 source 컬럼 추가 (web/telegram) | ✅ 실행됨 |
| `supabase/migrations/00006_create_persona_tables.sql` | 페르소나 3개 테이블 (user_personas, persona_items, persona_feedback) + RLS | ✅ 실행됨 |
| `supabase/migrations/00007_add_user_tiers.sql` | users 테이블에 tier + monthly_gen_count + gen_count_reset_month 컬럼 추가 | ✅ 실행됨 |
| `supabase/migrations/00008_reserve_generation_rpc.sql` | 원자적 사용량 체크+증분 RPC (`reserve_generation`, `rollback_generation`) | ✅ 실행됨 |
| `supabase/migrations/00009_drop_user_credentials.sql` | user_credentials 테이블 삭제 (보안 — ID/PW 저장 제거) | ✅ 실행됨 |
| `supabase/migrations/00010_bot_cookies.sql` | 쿠키 업로드 테이블 (bot_cookies) — 웹에서 업로드, 봇이 읽어 사용 | 미실행 |
| `package.json` | 의존성 (Next 14, Supabase, shadcn/ui, react-hook-form, zod) | ✅ |

### 작업 문서

| 경로 | 역할 |
|------|------|
| `docs/프로젝트/tasks/W1-인프라.md` | W1 인프라 세팅 작업 상세 |
| `docs/프로젝트/tasks/W2-인증-대시보드.md` | W2 인증 + 대시보드 작업 상세 |
| `docs/프로젝트/tasks/W3-AI글쓰기.md` | W3 AI 글쓰기 핵심 기능 작업 상세 |
| `docs/프로젝트/tasks/W4-마무리.md` | W4 마무리 + 사용자 확장 작업 상세 |

---

## 진입점

| 파일 | 역할 | Phase | 상태 |
|------|------|-------|------|
| `main.py` | 댓글 봇 스케줄러 진입점 (argparse + schedule) | 1 | ✅ |
| `publisher_main.py` | 게시물 발행 CLI 진입점 (--photos, --memo, --dry-run, --no-ai) | 2 | ⚠️ (셀렉터 이슈) |
| `api_server.py` | FastAPI 웹훅 서버 — n8n 연동 6개 엔드포인트 (generate, publish, status, comment/run, feedback, health) | 3 | ✅ |
| `telegram_bot.py` | 텔레그램 봇 (사진 수신 → AI 초안) | 3 | ✅ |
| `telegram_bot_simple.py` | 텔레그램 봇 (댓글 승인 워크플로) — `/pending`, `/execute` | 3 | 🚧 개발 중 |
| `debug_publisher.py` | 스마트에디터 DOM 분석 도구 (headless=False, 셀렉터 탐색) | 2 | ✅ |

---

## config/

| 파일 | 역할 |
|------|------|
| `settings.py` | 모든 상수 중앙 관리 — URL, 한도, 딜레이, 타임아웃, AI 모델, 이미지 제약 |

---

## src/auth/

| 파일 | 역할 |
|------|------|
| `naver_login.py` | 네이버 로그인 (쿠키 복원 → ID/PW 폭백). `ensure_login()` 메인 함수 |
| `session_manager.py` | 세션 관리 — 주기적 상태 체크, 자동 갱신, 실패 알림 | ✅ **신규**

---

## src/ai/

| 파일 | 역할 | Phase | 상태 |
|------|------|-------|------|
| `content_generator.py` | AI 콘텐츠 생성 — Vision 분석 → 카테고리 감지 → PRODUCTION_SPEC 기반 초안 생성 → 해시태그. `generate_post()` 메인 함수 | 2 | ✅ |
| `memo_parser.py` | 텔레그램 메모 구조화 파서 — ParsedMemo 데이터클리스 반환 (장소, 메뉴, 평점, 협찬 등). `parse_memo()` + `memo_to_prompt_context()` | 3 | ✅ |
| `skill_manager.py` | 피드백 → 카테고리별 스타일 파일 자동 갱신. `record_feedback()` 메인 함수. 5걸마다 AI 패턴 분석 | 4 | ✅ |

---

## src/collectors/

| 파일 | 역할 |
|------|------|
| `comment_collector.py` | 내 블로그 댓글 작성자 수집 (관리자 → 폭백: 게시물 직접). `collect_commenters()` |
| `post_collector.py` | 타겟 블로거 최근 게시물 수집 (신형/구형 지원). `collect_posts()` |

---

## src/commenter/

| 파일 | 역할 | 상태 |
|------|------|------|
| `comment_writer.py` | 댓글 작성 — iframe 탐색 + 인간적 타이핑. `write_comment()` | ✅ |
| `ai_comment.py` | AI 댓글 생성 (Haiku). phrases 폭백 + 안전 필터 + 중복 체크. `generate_comment()` | ✅ (2026-03-04 개선) |
| `phrases.py` | 고정 댓글 문구 풀 (AI 폭백용). `pick_phrase()` | ✅ |

---

## src/publisher/

| 파일 | 역할 | Phase | 상태 |
|------|------|-------|------|
| `blog_publisher.py` | 스마트에디터 자동화 — 제목/이미지/본문/폰트/태그/발행. `publish_post()` | 2 | ⚠️ **셀렉터 업데이트 필요** |

---

## src/storage/

| 파일 | 역할 | 상태 |
|------|------|------|
| `database.py` | SQLite 레이어 — 운영 데이터 전용 (6개 테이블) + retry 데코레이터 | ✅ (W6-07 정리) |
| `supabase_client.py` | Supabase 클라이언트 (service_role) — 생성 저장 + 봇 제어 평면 (pending/settings/run_log) | ✅ |

### SQLite 테이블 요약 (운영 데이터)

| 테이블 | 용도 | Phase | 상태 |
|--------|------|-------|------|
| `comment_history` | 댓글 이력 (post_url UNIQUE) | 1 | ✅ |
| `blogger_visit_log` | 일별 블로거 방문 기록 | 1 | ✅ |
| `run_log` | 실행 통계 (방문 수, 댓글 수, 에러) | 1 | ✅ |
| `post_history` | 게시물 발행 이력 (title, body, hashtags, status, category) | 2 | ✅ |
| `retry_queue` | 재시도 대기 큐 | 3 | ✅ |
| `blogger_behavior` | 오토 블로거 패턴 추적 | 1 | ✅ |

### Supabase 테이블 (제어 평면 — 웹·텔레그램 공유)

| 테이블 | 용도 | 상태 |
|--------|------|------|
| `pending_comments` | 승인 대기 댓글 큐 (웹·텔레그램 양쪽 제어) | ✅ W6 이관 |
| `bot_settings` | 봇 설정 (모드, 시간대, 한도) | ✅ W6 이관 |
| `bot_run_log` | 실행 이력 요약 (웹 대시보드용) | ✅ W6 이관 |
| `bot_cookies` | 네이버 세션 쿠키 (웹 업로드 → 봇 읽기) | ✅ 신규 |

---

## src/detectors/

| 파일 | 역할 | 상태 |
|------|------|------|
| `auto_blogger_detector.py` | 오토 블로거 감지 — 패턴 분석, 점수 계산, 스킵 결정 | ✅ **신규** |

---

## src/utils/

| 파일 | 역할 | 상태 |
|------|------|------|
| `logger.py` | RotatingFileHandler(10MB) + 콘솔 출력. `logger` 싱글톤 | ✅ |
| `delay.py` | 봇 감지 회피 딜레이 4종 (comments, bloggers, typing, short) | ✅ |
| `telegram_notifier.py` | 텔레그램 알림 유틸 — 로그인/캡차/세션 만료 긴급 알림 | ✅ **신규**
| `time_guard.py` | 허용 시간대 체크 (평일 20-24시, 주말 13-18시). `is_allowed_time()` | ✅ (2026-03-04 주말 확장) |
| `browser.py` | Playwright 브라우저 공통 설정 (user-agent, viewport, args). `create_browser()` | ✅ |
| `photo_marker.py` | 사진 마커 `[PHOTO_N]` 파싱/렌더링/제거. `split_body_by_markers()`, `render_html_segments()`, `strip_markers()` | ✅ |

---

## src/orchestrator.py

| 파일 | 역할 | 상태 |
|------|------|------|
| `orchestrator.py` | 댓글 봇 전체 흐름 조율 — 로그인 → 수집 → 댓글 → DB. `run()` | ✅ (승인 모드 연동 예정) |

---

## skills/

| 파일 | 역할 |
|------|------|
| `PRODUCTION_SPEC.md` | AI 블로그 제작 스펙 — 페르소나, 보이스, 이모지, 구조 템플릿, 금지 목록, 평점, 전체 흐름 예시 (content_generator.py가 참조) |
| `INPUT_GUIDE.md` | 텔레그램 입력 가이드 — 사진 순서, 메모 형식, 카테고리별 예시 (사용자 참고용) |
| `writing_style.md` | AI 글쓰기 스타일 가이드 기본 파일 (레거시 — PRODUCTION_SPEC.md로 대처됨) |
| `styles/맛집.md` | 맛집 카테고리 전용 스타일 가이드 (generate_style_guides.py로 생성) |
| `styles/카페.md` | 카페 카테고리 전용 스타일 가이드 |
| `styles/여행.md` | 여행 카테고리 전용 스타일 가이드 |
| `styles/일상.md` | 일상 카테고리 전용 스타일 가이드 |
| `styles/_font_config.json` | 블로그 폰트 설정 (크롤링에서 추출, publisher가 참조) |
| `blog_analysis/raw_posts.json` | 크롤링 원본 데이터 (analyze_blog_style.py 출력) |

---

## scripts/

| 파일 | 역할 | 상태 |
|------|------|------|
| `analyze_blog_style.py` | Playwright로 타겟 블로그 게시물 크롤링 → raw_posts.json 생성 | ✅ |
| `generate_style_guides.py` | raw_posts.json → Claude 분석 → 카테고리별 스타일 가이드 4개 + 폰트 설정 생성 | ✅ |
| `validate_selectors.py` | 스마트에디터 셀렉터 검증 도구 — 실패 시 신규 셀렉터 탐색 | ✅ **신규** |

---

## n8n/

| 파일 | 역할 | Phase | 상태 |
|------|------|-------|------|
| `workflows/blog_post_flow.json` | 텔레그램 사진 수신 → AI 초안 → 승인 → 네이버 발행 워크플로 | 3 | ✅ |
| `workflows/comment_bot_flow.json` | 댓글 봇 스케줄(매일 20:30) + 텔레그램 명령어(/start_comment, /status) 제어 | 3 | ✅ |

---

## docs/

| 파일 | 역할 |
|------|------|
| `개발/아키텍처/ARCHITECTURE.md` | **통합 아키텍처 문서** (블록도, 데이터 흐름, 파일 구조, DB 스키마, 실행법) | ✅ **신규** |
| `00-project-overview.md` | 프로젝트 전체 개요 + 아키텍처 다이어그램 (→ ARCHITECTURE.md로 통합) |
| `IMPLEMENTATION_STATUS.md` | **구현 현황 — Phase별 완료도 및 상세 상태** | ✅ **신규** |
| `phase1-ai-comment.md` | Phase 1 설계 문서 |
| `phase2-publisher.md` | Phase 2 설계 문서 |
| `phase3-n8n-telegram.md` | Phase 3 설계 문서 |
| `phase4-feedback.md` | Phase 4 설계 문서 |
| `COMMENT_BOT_SCENARIO.md` | 댓글 봇 시나리오 문서 |
| `EDITOR_SELECTOR_STATUS.md` | 스마트에디터 셀렉터 검증 결과 |
| `REQUIREMENTS_SUMMARY.md` | 요구사항 요약 |
| `프로젝트/TASK.md` | 작업 현황 실시간 추적 |
| `프로젝트/CODE_MAP.md` | 코드베이스 지도 (이 파일) |
| `프로젝트/매뉴얼/coding-rules.md` | Python 코딩 규칙 |
| `프로젝트/매뉴얼/workflow-rules.md` | 워크플로우 + 코드리뷰 규칙 |
| `프로젝트/코드리뷰/REVIEW_LOG.md` | 코드리뷰 기록 |

---

## 기타 프로젝트 루트

| 파일 | 역할 |
|------|------|
| `CLAUDE.md` | 프로젝트 컨텍스트 (매 세션 자동 로드) |
| `REQUIREMENTS.md` | 전체 요구사항 명세 |
| `requirements.txt` | Python 패키지 의존성 |
| `.env` | 환경변수 (NAVER_ID, NAVER_PW, MY_BLOG_ID, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, API_SECRET_TOKEN) |
| `.env.example` | 환경변수 템플릿 |
| `.gitignore` | git 제외 목록 |

---

## 데이터/로그/쿠키 (gitignore)

| 경로 | 역할 |
|------|------|
| `data/comments.db` | SQLite DB |
| `data/debug/` | debug_publisher.py 출력 (스크린샷, HTML 덤프) |
| `logs/commenter.log` | 실행 로그 (RotatingFile, 10MB×3) |
| `cookies/naver_cookies.json` | 네이버 세션 쿠키 |

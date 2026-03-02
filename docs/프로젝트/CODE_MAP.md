# CODE_MAP — 코드베이스 지도

> 파일 추가/삭제/이동/역할 변경 시 반드시 갱신.
> 최종 갱신: 2026-03-02

---

## 진입점

| 파일 | 역할 | Phase |
|------|------|-------|
| `main.py` | 댓글 봇 스케줄러 진입점 (argparse + schedule) | 1 |
| `publisher_main.py` | 게시물 발행 CLI 진입점 (--photos, --memo, --dry-run, --no-ai) | 2 |
| `debug_publisher.py` | 스마트에디터 DOM 분석 도구 (headless=False, 셀렉터 탐색) | 2 |

---

## config/

| 파일 | 역할 |
|------|------|
| `settings.py` | 모든 상수 중앙 관리 — URL, 한도, 딜레이, 타임아웃, AI 모델, 이미지 제약 |

---

## src/auth/

| 파일 | 역할 |
|------|------|
| `naver_login.py` | 네이버 로그인 (쿠키 복원 → ID/PW 폴백). `ensure_login()` 메인 함수 |

---

## src/ai/

| 파일 | 역할 | Phase |
|------|------|-------|
| `content_generator.py` | AI 콘텐츠 생성 — Vision 분석 → 초안 생성 → 해시태그. `generate_post()` 메인 함수 | 2 |

### 예정 (미구현)
| 파일 | 역할 | Phase |
|------|------|-------|
| `skill_manager.py` | 피드백 → writing_style.md 자동 갱신 | 4 |

---

## src/collectors/

| 파일 | 역할 |
|------|------|
| `comment_collector.py` | 내 블로그 댓글 작성자 수집 (관리자 → 폴백: 게시물 직접). `collect_commenters()` |
| `post_collector.py` | 타겟 블로거 최근 게시물 수집 (신형/구형 지원). `collect_posts()` |

---

## src/commenter/

| 파일 | 역할 |
|------|------|
| `comment_writer.py` | 댓글 작성 — iframe 탐색 + 인간적 타이핑. `write_comment()` |
| `ai_comment.py` | AI 댓글 생성 (Haiku). phrases 폴백. `generate_comment()` |
| `phrases.py` | 고정 댓글 문구 풀 (AI 폴백용). `pick_phrase()` |

---

## src/publisher/

| 파일 | 역할 | Phase |
|------|------|-------|
| `blog_publisher.py` | 스마트에디터 자동화 — 제목/이미지/본문/태그/발행. `publish_post()` | 2 |

---

## src/storage/

| 파일 | 역할 |
|------|------|
| `database.py` | SQLite 레이어 — 4개 테이블 (comment_history, blogger_visit_log, run_log, post_history) |

### 테이블 요약
| 테이블 | 용도 | Phase |
|--------|------|-------|
| `comment_history` | 댓글 이력 (post_url UNIQUE) | 1 |
| `blogger_visit_log` | 일별 블로거 방문 기록 | 1 |
| `run_log` | 실행 통계 (방문 수, 댓글 수, 에러) | 1 |
| `post_history` | 게시물 발행 이력 (title, body, hashtags, status) | 2 |

### 예정 (미구현)
| 테이블 | 용도 | Phase |
|--------|------|-------|
| `post_feedback` | 피드백 이력 (post_url, feedback, applied_at) | 4 |

---

## src/utils/

| 파일 | 역할 |
|------|------|
| `logger.py` | RotatingFileHandler(10MB) + 콘솔 출력. `logger` 싱글톤 |
| `delay.py` | 봇 감지 회피 딜레이 4종 (comments, bloggers, typing, short) |
| `time_guard.py` | 허용 시간대 체크 (20:00~24:00). `is_allowed_time()`, `assert_allowed_time()` |
| `browser.py` | Playwright 브라우저 공통 설정 (user-agent, viewport, args). `create_browser()` |

---

## src/orchestrator.py

| 파일 | 역할 |
|------|------|
| `orchestrator.py` | 댓글 봇 전체 흐름 조율 — 로그인 → 수집 → 댓글 → DB. `run()` |

---

## skills/

| 파일 | 역할 |
|------|------|
| `writing_style.md` | AI 글쓰기 스타일 가이드 (content_generator가 참조). Phase 4에서 자동 갱신 예정 |

---

## docs/

| 파일 | 역할 |
|------|------|
| `00-project-overview.md` | 프로젝트 전체 개요 + 아키텍처 다이어그램 |
| `phase1-ai-comment.md` | Phase 1 설계 문서 |
| `phase2-publisher.md` | Phase 2 설계 문서 |
| `phase3-n8n-telegram.md` | Phase 3 설계 문서 |
| `phase4-feedback.md` | Phase 4 설계 문서 |
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
| `.env` | 환경변수 (NAVER_ID, NAVER_PW, MY_BLOG_ID, ANTHROPIC_API_KEY) |
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

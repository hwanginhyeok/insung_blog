# 시스템 아키텍처

> **버전**: 2.0 (통합)
> **최종 업데이트**: 2026-03-06
> **상태**: 웹 플랫폼 MVP + 텔레그램 봇 운영 중

---

## 전체 블록 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          입력 채널 (동시 운영)                            │
│                                                                         │
│  ┌──────────────────────┐         ┌──────────────────────┐              │
│  │   웹 (Next.js 14)    │         │   텔레그램 봇         │              │
│  │   localhost:3001      │         │   telegram_bot.py    │              │
│  │                      │         │                      │              │
│  │  • 사진 업로드       │         │  • 사진 전송         │              │
│  │  • 메모 + 카테고리   │         │  • 캡션(메모)        │              │
│  │  • 초안 편집/복사    │         │  • HTML 프리뷰       │              │
│  │  • 히스토리 조회     │         │  • 댓글 승인/거부    │              │
│  └──────────┬───────────┘         └──────────┬───────────┘              │
└─────────────┼────────────────────────────────┼──────────────────────────┘
              │ HTTPS                           │ Telegram API (Long Polling)
              ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         처리 레이어                                      │
│                                                                         │
│  ┌──────────────────────┐         ┌──────────────────────┐              │
│  │  Vercel API Routes   │         │  FastAPI :8001       │              │
│  │  /api/generate       │         │  api_server.py       │              │
│  │  /api/regenerate     │         │                      │              │
│  │  TS: generate-post.ts│         │  POST /generate      │              │
│  │  Claude Haiku 4.5    │         │  POST /publish       │              │
│  │  PRODUCTION_SPEC     │         │  POST /comment/*     │              │
│  │                      │         │  POST /feedback      │              │
│  └──────────┬───────────┘         └──────────┬───────────┘              │
│             │                                 │                          │
│             │  AI 파이프라인 (동일 4단계)       │                          │
│             │  1. Vision → 사진 분석           │                          │
│             │  2. 카테고리 감지                │                          │
│             │  3. PRODUCTION_SPEC 초안 생성    │                          │
│             │  4. 해시태그 생성                │                          │
│             │                                 │                          │
└─────────────┼─────────────────────────────────┼─────────────────────────┘
              │                                 │
              ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Supabase (공통 데이터 허브)                            │
│                                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│  │   users     │ │ generation  │ │    user     │ │   photos    │      │
│  │             │ │   _queue    │ │ credentials │ │  (Storage)  │      │
│  │  id, email  │ │  user_id   │ │  naver_id   │ │  user_id/   │      │
│  │  role       │ │  status    │ │  blog_id    │ │  *.jpg      │      │
│  │  status     │ │  input_*   │ │  cookies    │ │             │      │
│  └─────────────┘ │  generated_*│ └─────────────┘ └─────────────┘      │
│                  │  source     │                                       │
│                  │  (web|tg)   │   RLS: auth.uid() = user_id          │
│                  └─────────────┘                                       │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             │ Supabase Realtime / Polling
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Worker (집 PC, 로컬 실행)                             │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  댓글 봇 (main.py + orchestrator.py)                              │  │
│  │  • Cron: 평일 20:30, 주말 13:30                                   │  │
│  │  • Playwright → 네이버 댓글 자동 작성                              │  │
│  │  • SQLite (data/comments.db) 로컬 이력                            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  n8n (선택 — 워크플로 자동화)                                      │  │
│  │  • blog_post_flow.json: 텔레그램→AI→발행                          │  │
│  │  • comment_bot_flow.json: 댓글 봇 스케줄                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 데이터 흐름

### 웹에서 글 생성

```
브라우저 → 사진 업로드 (Supabase Storage)
        → POST /api/generate
        → Claude API (4단계: Vision → Category → Draft → Hashtags)
        → 화면에 초안 표시 (사진 인라인 + 편집 가능)
        → (선택) 피드백 입력 → POST /api/regenerate → 수정된 초안
        → "저장" 클릭 → generation_queue INSERT (source: 'web')
        → "복사" 클릭 → 클립보드 복사 (제목+본문+해시태그)
```

### 텔레그램에서 글 생성

```
텔레그램 → 사진 전송 (media group)
        → telegram_bot.py → _process_photos()
        → src/ai/content_generator.py (Python, 동일 4단계)
        → HTML 프리뷰 생성 + 텔레그램 전송
        → generation_queue INSERT (source: 'telegram')
```

### 댓글 봇

```
Cron/텔레그램 → main.py --run-once
             → orchestrator.py
             → 내 블로그 댓글 수집 → 방문 → AI 댓글 생성 → 작성
             → 텔레그램 알림 (성공/실패)
```

### 댓글 승인 워크플로 (텔레그램)

```
/preview_comment {blog_id}
  → Playwright로 게시물 스크래핑
  → AI 댓글 생성
  → Inline Keyboard [✅ 승인] [❌ 거부] [✏️ 수정]
  → /execute → api_server.py POST /comment/execute → 일괄 작성
```

---

## 실제 파일 구조 (현재 상태)

```
인성이프로젝트/
│
├── apps/web/                          # Next.js 14 웹 플랫폼
│   ├── app/
│   │   ├── page.tsx                   # 랜딩 페이지
│   │   ├── layout.tsx                 # 루트 레이아웃 (lang="ko")
│   │   ├── (auth)/login/page.tsx      # 로그인/회원가입
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx             # 대시보드 레이아웃 (Header)
│   │   │   ├── dashboard/page.tsx     # 내 글 목록 (generation_queue)
│   │   │   └── write/page.tsx         # AI 글쓰기 에디터
│   │   ├── api/generate/route.ts      # AI 생성 API
│   │   └── api/regenerate/route.ts   # AI 재생성 API (피드백 기반)
│   ├── components/
│   │   ├── ui/                        # shadcn/ui
│   │   └── nav/header.tsx             # 헤더 (로그아웃, 이메일 표시)
│   ├── lib/
│   │   ├── supabase.ts                # 브라우저 클라이언트
│   │   ├── supabase-server.ts         # 서버 클라이언트 (쿠키 기반)
│   │   ├── supabase-admin.ts          # Admin 클라이언트 (service_role)
│   │   ├── database.types.ts          # 수동 타입 정의
│   │   ├── ai/generate-post.ts        # AI 4단계 파이프라인 (TS)
│   │   └── hooks/use-user.ts          # 사용자 프로필 + role 훅
│   ├── middleware.ts                   # 인증 미들웨어
│   ├── data/production-spec.md        # AI 글쓰기 스펙 (38KB)
│   ├── supabase/migrations/           # SQL 마이그레이션 (00001~00004)
│   └── .env.local                     # Supabase + Anthropic 키
│
├── telegram_bot.py                    # 텔레그램 봇 (814줄)
├── api_server.py                      # FastAPI :8001 (508줄)
├── main.py                            # 댓글 봇 진입점
├── src/
│   ├── ai/
│   │   ├── content_generator.py       # AI 4단계 파이프라인 (Python)
│   │   ├── skill_manager.py           # 피드백 → 스킬 업데이트
│   │   └── memo_parser.py             # 메모 파싱
│   ├── auth/
│   │   ├── naver_login.py             # 네이버 로그인 (쿠키)
│   │   └── session_manager.py         # 세션 관리
│   ├── collectors/
│   │   ├── comment_collector.py       # 댓글 수집
│   │   └── post_collector.py          # 게시물 수집
│   ├── commenter/
│   │   ├── comment_writer.py          # Playwright 댓글 작성
│   │   ├── ai_comment.py              # AI 댓글 생성 (Haiku)
│   │   └── phrases.py                 # 고정 문구 (폴백)
│   ├── publisher/
│   │   └── blog_publisher.py          # 스마트에디터 자동 게시
│   ├── storage/
│   │   └── database.py                # SQLite (comments.db)
│   └── utils/
│       ├── telegram_notifier.py       # 긴급 알림 (로그인실패, 캡차)
│       ├── photo_marker.py            # [PHOTO_N] → HTML 변환
│       ├── logger.py                  # 로깅
│       ├── delay.py                   # 봇 감지 회피
│       ├── time_guard.py              # 시간대 체크
│       └── browser.py                 # Playwright 공통
│
├── n8n/workflows/
│   ├── blog_post_flow.json            # 글 작성 워크플로
│   └── comment_bot_flow.json          # 댓글 봇 워크플로
│
├── skills/
│   ├── PRODUCTION_SPEC.md             # AI 글쓰기 규칙서 (원본)
│   ├── writing_style.md               # 글쓰기 스타일 가이드
│   ├── SKILL.md                       # 스킬 누적 파일
│   └── INPUT_GUIDE.md                 # 입력 가이드
│
├── config/settings.py                 # 전체 설정/상수
├── .env                               # 환경변수 (로컬)
└── data/comments.db                   # SQLite DB
```

---

## Supabase 테이블

| 테이블 | 용도 | RLS |
|--------|------|-----|
| `users` | 사용자 (id, email, role, status) | auth.uid() = id |
| `user_credentials` | 네이버 인증 정보 (암호화) | auth.uid() = user_id |
| `generation_queue` | AI 생성 큐 (입력→생성→완료) | auth.uid() = user_id |
| `user_queue_stats` (view) | 사용자별 큐 통계 | — |

### generation_queue 상태 흐름

```
pending → processing → completed
                    → failed → (재시도)
                    → cancelled
```

---

## 실행 방법

### 웹 플랫폼

```bash
cd apps/web
npm run dev  # localhost:3001
```

### 텔레그램 봇

```bash
source .venv/bin/activate
python telegram_bot.py
```

### API 서버 (텔레그램/n8n 백엔드)

```bash
source .venv/bin/activate
uvicorn api_server:app --port 8001
```

### 댓글 봇

```bash
source .venv/bin/activate
python main.py --run-once  # 1회 실행
python main.py             # 스케줄 모드 (매일 20:30)
```

### n8n (선택)

```bash
n8n start  # localhost:5678
# 워크플로 import: n8n/workflows/*.json
```

---

## 환경변수

| 변수 | 용도 | 파일 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | apps/web/.env.local |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | apps/web/.env.local |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin | apps/web/.env.local |
| `ANTHROPIC_API_KEY` | Claude API | apps/web/.env.local, .env |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 | .env |
| `TELEGRAM_CHAT_ID` | 허용 Chat ID | .env |
| `NAVER_ID` / `NAVER_PW` | 네이버 로그인 | .env |
| `MY_BLOG_ID` | 블로그 ID | .env |
| `API_SECRET_TOKEN` | FastAPI 인증 | .env |

---

## 완료된 통합 작업

### 텔레그램 → Supabase 연동 — ✅ 완료 (03-06)

텔레그램 봇에서 AI 생성 완료 후 `generation_queue`에 자동 INSERT.
웹 대시보드에서 텔레그램으로 생성한 글도 조회 가능 (TG 뱃지 표시).

- `src/storage/supabase_client.py` — Python Supabase 클라이언트 (service_role)
- `telegram_bot.py` `_process_photos()` — 생성 완료 후 `save_generation(source="telegram")` 호출
- `generation_queue.source` 컬럼 — `'web'` | `'telegram'` (00005 마이그레이션)

### 재생성(피드백) 기능 — ✅ 완료 (03-06)

기존 초안 + 사용자 피드백 → 수정된 초안 (Vision 단계 생략, 비용/시간 절약).

- `lib/ai/generate-post.ts` `regeneratePost()` — PRODUCTION_SPEC + 이전 초안 + 피드백
- `app/api/regenerate/route.ts` — POST 엔드포인트 (getUser 인증)
- `write/page.tsx` — 피드백 textarea + 재생성 버튼 UI

### 보안 강화 — ✅ 완료 (03-06)

- Open redirect 수정 (login redirect 파라미터 검증)
- `getSession()` → `getUser()` 전환 (API Routes에서 서버사이드 JWT 검증)
- 타입 안전성 개선 (`database.types.ts` Insert 타입 확장)

---

## TODO: 다음 통합 작업

### 페르소나 학습 파이프라인 — 설계 완료, 구현 대기

블로그 URL → 크롤링(AJAX + cheerio) → AI 분석 → DB 기반 페르소나 생성.
사용자별 페르소나를 `user_personas` + `persona_items` 테이블로 관리.
피드백 루프: 재생성 피드백 → 패턴 분석 → 규칙 도출 → 사용자 승인 → 적용.

상세 설계: `TASK.md` W5 섹션 참조.

### AI 파이프라인 이중화 해소

| 언어 | 파일 | 호출처 |
|------|------|--------|
| Python | `src/ai/content_generator.py` | telegram_bot, api_server |
| TypeScript | `lib/ai/generate-post.ts` | 웹 /api/generate, /api/regenerate |

동일 Claude API + 동일 PRODUCTION_SPEC 사용. 스펙 변경 시 양쪽 모두 반영 필요.
페르소나 파이프라인 완성 후 DB 기반 스펙으로 통일 예정.

---

## Changelog

- **2026-03-06 (2차)**: v2.1 — 텔레그램→Supabase 완료, 재생성 API, 보안 수정 반영, 페르소나 파이프라인 설계
- **2026-03-06**: v2.0 — 기존 문서 4개 통합 (00-system-overview, 05-file-structure, 00-project-overview, phase3-n8n-telegram)
- **2026-03-05**: v1.0 — Phase 0 초기 설계

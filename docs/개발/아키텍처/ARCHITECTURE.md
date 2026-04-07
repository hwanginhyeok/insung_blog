# 시스템 설계서 — 인성이프로젝트

> **단일 진실 공급원(Single Source of Truth)**
> 아키텍처, 데이터 모델, 구현 현황, 요구사항을 이 문서 하나로 관리한다.
> 코드 수준 상세는 `docs/프로젝트/CODE_MAP.md`, 작업 추적은 루트 `CURRENT_TASK.md` / `PREPARED_TASK.md` 참조.
>
> **최종 업데이트**: 2026-03-12
> **버전**: 3.0

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [전체 블록 다이어그램](#2-전체-블록-다이어그램)
3. [데이터 흐름](#3-데이터-흐름)
4. [데이터 모델](#4-데이터-모델)
5. [구현 현황](#5-구현-현황)
6. [확장 전략](#6-확장-전략)
7. [알려진 이슈](#7-알려진-이슈)
8. [비용](#8-비용)
9. [실행 방법](#9-실행-방법)
10. [환경변수](#10-환경변수)

---

## 1. 프로젝트 개요

네이버 블로그 운영 자동화 + AI 글쓰기 파트너 웹 플랫폼.

| 영역 | 설명 | 상태 |
|------|------|------|
| **웹 플랫폼** | AI 글쓰기, 페르소나, 캘린더, 성과 분석 | 운영 중 (insungblog.vercel.app) |
| **댓글 봇** | 답방 댓글 자동 작성 (웹+텔레그램 이중 제어) | 운영 중 (Cron) |
| **텔레그램 봇** | 사진 전송 → AI 초안, 댓글 승인/거부 | 운영 중 |
| **게시물 자동 발행** | 스마트에디터 자동 게시 | 차단 (셀렉터 전면 변경) |

### 기술 스택

| 레이어 | 기술 |
|--------|------|
| 웹 프론트엔드 | Next.js 14 (App Router) + Tailwind + shadcn/ui |
| 웹 배포 | Vercel (Hobby) |
| DB/Auth/Storage | Supabase (PostgreSQL + RLS + Storage) |
| AI | Anthropic Claude — Vision(Sonnet), Text(Haiku 4.5) |
| 로컬 봇 | Python 3.12 + Playwright + SQLite |
| 로컬 API | FastAPI :8001 |
| 알림/제어 | Telegram Bot API |

---

## 2. 전체 블록 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          입력 채널 (동시 운영)                            │
│                                                                         │
│  ┌────────────────────────┐              ┌────────────────────────┐     │
│  │    웹 (Next.js 14)     │              │    텔레그램 봇          │     │
│  │    insungblog.vercel   │              │    telegram_bot.py     │     │
│  │                        │              │                        │     │
│  │  • AI 글쓰기 + 재생성  │              │  • 사진 전송 → AI 초안 │     │
│  │  • 페르소나 관리       │              │  • 댓글 승인/거부      │     │
│  │  • 콘텐츠 캘린더       │              │  • 봇 상태 확인        │     │
│  │  • 성과 분석           │              │  • 설정 변경           │     │
│  │  • 댓글 봇 제어 (/bot) │              │                        │     │
│  │  • 관리자 페이지       │              │                        │     │
│  └───────────┬────────────┘              └───────────┬────────────┘     │
└──────────────┼───────────────────────────────────────┼──────────────────┘
               │ HTTPS                                 │ Telegram API
               ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            처리 레이어                                    │
│                                                                         │
│  ┌────────────────────────┐              ┌────────────────────────┐     │
│  │   Vercel API Routes    │              │   FastAPI :8001        │     │
│  │                        │              │   api_server.py        │     │
│  │  /api/generate         │              │                        │     │
│  │  /api/regenerate       │              │  POST /generate        │     │
│  │  /api/persona/*        │              │  POST /comment/*       │     │
│  │  /api/bot/*            │              │  POST /feedback        │     │
│  │  /api/calendar         │              │                        │     │
│  │  /api/analytics        │              │                        │     │
│  │  /api/admin/*          │              │                        │     │
│  │  /api/auth/kakao|naver │              │                        │     │
│  └───────────┬────────────┘              └───────────┬────────────┘     │
│              │                                       │                  │
│              │  AI 파이프라인 (동일 4단계)             │                  │
│              │  1. Vision → 사진 분석                 │                  │
│              │  2. 카테고리 감지                      │                  │
│              │  3. PRODUCTION_SPEC + 페르소나 → 초안  │                  │
│              │  4. 해시태그 생성                      │                  │
└──────────────┼───────────────────────────────────────┼──────────────────┘
               │                                       │
               ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Supabase (공통 데이터 허브)                           │
│                                                                         │
│  ┌─── 웹 플랫폼 테이블 ──────────────────────────────────────────────┐  │
│  │ users │ generation_queue │ user_personas │ persona_items │ ...     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── 봇 제어 평면 (웹 + 텔레그램 공유) ─────────────────────────────┐  │
│  │ pending_comments │ bot_settings │ bot_run_log │ bot_cookies        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── Storage (S3 호환) ─────────────────────────────────────────────┐  │
│  │ photos/{user_id}/*.jpg                                             │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  RLS: auth.uid() = user_id (모든 테이블)                                 │
│  봇: service_role 키로 RLS 우회                                          │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ Polling / service_role
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Worker (집 PC, 로컬 실행)                           │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  댓글 봇 (main.py + orchestrator.py)                              │  │
│  │  • Cron: 평일 20:30, 주말 13:30 (±30분 랜덤)                     │  │
│  │  • Playwright → 네이버 댓글 자동 작성                              │  │
│  │  • 제어 평면: Supabase (pending/settings/run_log)                 │  │
│  │  • 운영 데이터: SQLite (comment_history/visit_log/behavior)       │  │
│  │  • 쿠키: Supabase bot_cookies ← 웹 업로드 (양방향 동기화)        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  tmux blog 세션                                                    │  │
│  │  • api(8001) + telegram + worker + web(3002)                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 데이터 흐름

### 3.1 웹에서 글 생성

```
브라우저 → 사진 업로드 (Supabase Storage)
        → 페르소나 선택 (드롭다운)
        → POST /api/generate
        → Claude API (4단계: Vision → Category → Draft → Hashtags)
        → 화면에 초안 표시 (사진 인라인 + 편집 가능)
        → (선택) 피드백 입력 → POST /api/regenerate → 수정된 초안
        → "저장" 클릭 → generation_queue INSERT (source: 'web')
        → "복사" 클릭 → 클립보드 복사 (제목+본문+해시태그)
```

### 3.2 텔레그램에서 글 생성

```
텔레그램 → 사진 전송 (media group)
        → telegram_bot.py → _process_photos()
        → src/ai/content_generator.py (Python, 동일 4단계)
        → HTML 프리뷰 생성 + 텔레그램 전송
        → generation_queue INSERT (source: 'telegram')
```

### 3.3 댓글 봇 — 이중 제어 (웹 + 텔레그램)

```
┌──────────────┐     ┌──────────────┐
│  웹 /bot     │     │  텔레그램     │
│  승인/거부   │     │  /pending     │
│  설정 변경   │     │  /execute     │
│  상태 확인   │     │  /settings    │
└──────┬───────┘     └──────┬───────┘
       │                    │
       ▼                    ▼
  ┌─────────────────────────────────┐
  │      Supabase (제어 평면)       │
  │  pending_comments  (승인 큐)    │
  │  bot_settings      (설정)      │
  │  bot_run_log       (이력)      │
  │  bot_cookies       (세션)      │
  └──────────────┬──────────────────┘
                 │ polling (service_role)
                 ▼
  ┌─────────────────────────────────┐
  │    댓글 봇 (Python + Cron)      │
  │                                 │
  │  auto 모드: 수집 → AI생성 → 즉시작성  │
  │  manual 모드: 수집 → AI생성 → pending → 승인 후 작성  │
  │                                 │
  │  SQLite (운영 데이터)           │
  │  • comment_history (중복 방지)  │
  │  • blogger_visit_log (일일 한도)│
  │  • blogger_behavior (패턴 추적) │
  └─────────────────────────────────┘
```

### 3.4 댓글 봇 실행 상세

```
START: Cron 트리거 (평일 20:30, 주말 13:30 ±30분)
  │
  ├─ 시간 체크 (평일 20-24시, 주말 13-18시)
  ├─ 환경변수 검증 (NAVER_ID, NAVER_PW, MY_BLOG_ID)
  ├─ Supabase에서 설정 로드 (bot_settings)
  ├─ 브라우저 생성 (Playwright headless)
  ├─ 네이버 로그인 (쿠키 복원 → ID/PW 폴백)
  ├─ 댓글 작성자 수집 (모바일 Playwright)
  ├─ 한도 체크 (블로거 10명/일, 댓글 30개/일)
  │
  ├─ [블로거 방문 루프] (랜덤 순서)
  │   ├─ 최근 게시물 3~5개 수집 (90일 이내)
  │   ├─ [게시물 댓글 루프]
  │   │   ├─ 본문 스크래핑 (1500자)
  │   │   ├─ AI 댓글 생성 (Haiku, 30~80자 해요체)
  │   │   │   └─ 중복 체크 (30일 이력, 70% 유사도)
  │   │   │   └─ 실패 시 phrases.py 폴백
  │   │   ├─ auto 모드 → 즉시 작성 (Playwright 타이핑)
  │   │   │   manual 모드 → pending_comments INSERT
  │   │   ├─ DB 기록 + 딜레이 (5~15초)
  │   │   └─ 연속 5회 실패 → 서킷 브레이커 (세션 중단)
  │   └─ 블로거 간 딜레이 (30~60초)
  │
  ├─ retry_queue 처리 (최대 3회)
  ├─ 실행 통계 기록 (SQLite + Supabase bot_run_log)
  └─ 텔레그램 알림 (성공/실패 요약)
```

### 3.5 댓글 승인 워크플로 (manual 모드)

```
봇 실행 → pending_comments INSERT (status: 'pending')
  │
  ├─ 웹 /bot 페이지에서:
  │   [블로거A] "맛집 포스팅" → "분위기 좋아 보여요~"  [승인] [거부]
  │   [블로거B] "제주 여행기" → "제주도 날씨 최고네요"  [승인] [거부]
  │   [일괄 승인] [일괄 거부]
  │
  ├─ 또는 텔레그램에서:
  │   /pending → Inline Keyboard [승인] [거부]
  │
  └─ 승인된 댓글 → 다음 봇 실행 시 일괄 작성
```

---

## 4. 데이터 모델

### 설계 원칙: 제어/운영 분리

| 구분 | 저장소 | 이유 |
|------|--------|------|
| **제어 평면** (승인, 설정, 이력) | Supabase | 웹+텔레그램 양쪽 접근 필요 |
| **운영 데이터** (중복체크, 방문로그) | SQLite | 실행 중 수십~수백 회 조회, 로컬 속도 필수 |

### 4.1 Supabase — 웹 플랫폼

| 테이블 | 용도 | 마이그레이션 |
|--------|------|-------------|
| `users` | 사용자 (id, email, role, tier, kakao_id, naver_id) | 00001, 00007, 00015 |
| `generation_queue` | AI 생성 큐 (입력→생성→완료, source: web/telegram, versions JSONB) | 00002, 00005, 00011 |
| `user_personas` | 페르소나 메타 (blog_url, is_default) | 00006, 00012 |
| `persona_items` | 페르소나 항목 (category, key, value, is_active) | 00006 |
| `persona_feedback` | 피드백 규칙 (pattern, suggestion, status) | 00006 |
| `content_calendar` | 콘텐츠 캘린더 (scheduled_date, category, status) | 00013 |
| `post_analytics` | 성과 스냅샷 (post_url, view_count, like_count) | 00014 |
| `user_post_stats` (view) | 최신 스냅샷 뷰 (DISTINCT ON) | 00014 |

### 4.2 Supabase — 봇 제어 평면 (W6~W7)

| 테이블 | 용도 | 마이그레이션 |
|--------|------|-------------|
| `pending_comments` | 승인 대기 댓글 (status: pending/approved/rejected/posted/failed, decided_by: web/telegram) | W6 |
| `bot_settings` | 봇 설정 (approval_mode, weekday/weekend_hours, max_comments/bloggers, is_active) | W6 |
| `bot_run_log` | 실행 이력 (bloggers_visited, comments_written/failed, duration) | W6 |
| `bot_cookies` | 네이버 세션 쿠키 (웹 업로드 → 봇 읽기, 양방향 동기화) | 00010 |

### 4.3 SQLite — 봇 운영 데이터 (로컬 전용)

| 테이블 | 용도 |
|--------|------|
| `comment_history` | 댓글 이력 (post_url UNIQUE, 중복 방지) |
| `blogger_visit_log` | 일별 블로거 방문 기록 (1일 1방문) |
| `blogger_behavior` | 오토 블로거 패턴 추적 (n-gram 분석) |
| `run_log` | 실행 통계 (방문 수, 댓글 수, 에러) |
| `post_history` | 게시물 발행 이력 |
| `retry_queue` | 재시도 대기 큐 (최대 3회) |

### 4.4 상태 흐름

```
generation_queue:  pending → processing → completed / failed / cancelled
pending_comments:  pending → approved → posted / failed
                          → rejected
```

---

## 5. 구현 현황

### 로컬 봇

| Phase | 주요 기능 | 상태 | 비고 |
|-------|----------|------|------|
| 1 | 댓글 봇 (수집/AI생성/작성/DB) | 완료 | 모바일 Playwright 전환 완료 |
| 2 | 게시물 자동 발행 | **차단** | 셀렉터 0/13 실패 (네이버 UI 전면 변경) |
| 3 | n8n + 텔레그램 연동 | 80% | `/execute` 일괄 실행 개발 중 |
| 4 | 피드백 루프 | 완료 | 5건 누적 시 AI 패턴 분석 |

### 웹 플랫폼

| 주차 | 주요 기능 | 상태 |
|------|----------|------|
| W1 | 인프라 (Supabase, Storage, 레이아웃) | 완료 |
| W2 | 인증 + 대시보드 (Auth, RLS, 내 글 목록) | 완료 |
| W3 | AI 글쓰기 (사진 → Vision → 초안 → 저장) | 완료 |
| W4 | 보안 강화 + 재생성 + 3티어 사용량 제한 | 완료 |
| W5 | 페르소나 학습 (크롤링 → AI 2-pass 분석 → 피드백 루프) | 완료 |
| W6 | 댓글 봇 웹 통합 (Supabase 제어 평면) | 완료 |
| W7 | 웹 봇 제어 + 쿠키 양방향 동기화 (Command Queue) | 완료 |
| P3 | 확장 기능 (다중 페르소나, 캘린더, 성과 분석, OAuth) | 완료 |

---

## 6. 확장 전략

### 멀티테넌시 (RLS 기반 격리)

```
┌─────────────────────────────────────────────┐
│            Supabase PostgreSQL               │
│                                             │
│  USER_A ─ credentials, queue, dna, cookies  │
│  USER_B ─ credentials, queue, dna, cookies  │
│                                             │
│  [RLS] WHERE user_id = auth.uid()           │
└─────────────────────────────────────────────┘
```

### Phase별 확장

| Phase | 사용자 수 | Worker | 비용/월 | 변경사항 |
|-------|-----------|--------|---------|---------|
| 0 (현재) | 1명 | 집 PC | $5 | 단일 사용자 |
| 1 | 2~5명 | 집 PC 멀티유저 | $5 | 코드만 변경 |
| 2 | 6~20명 | + VPS 1대 | $45 | 로드밸런싱 |
| 3 | 20명+ | Worker Pool 3대+ | $100+ | 자동 스케일링 |

---

## 7. 알려진 이슈

| 이슈 | 심각도 | 영향 | 상태 |
|------|--------|------|------|
| 스마트에디터 셀렉터 전면 변경 | 차단 | Phase 2 발행 불가 | 보류 (수동 발행으로 대체 중) |
| 관리자 댓글 URL 404 | 낮음 | 폴백(모바일)으로 정상 동작 | 해결됨 |
| AI 파이프라인 이중화 (Python + TS) | 기술부채 | 스펙 변경 시 양쪽 반영 필요 | 페르소나 DB 통일 후 해소 예정 |

---

## 8. 비용

| 항목 | 비용 | 비고 |
|------|------|------|
| AI 댓글 (Haiku) | ~$0.00018/건 | 월 50개 기준 ~$0.11 |
| AI 블로그 초안 (Haiku) | ~$0.003-0.01/건 | |
| AI 페르소나 분석 (Sonnet) | ~$0.05/회 | 1회성 |
| Supabase | 무료 | Free tier |
| Vercel | 무료 | Hobby plan |

---

## 9. 실행 방법

### 웹 플랫폼

```bash
cd apps/web && npm run dev  # localhost:3001
```

### 댓글 봇

```bash
source .venv/bin/activate
python main.py --run-once --dry-run   # 시뮬레이션
python main.py --run-once              # 즉시 1회
python main.py                         # 스케줄 모드
```

### 텔레그램 봇 + API 서버

```bash
source .venv/bin/activate
python telegram_bot.py                 # 텔레그램 봇
uvicorn api_server:app --port 8001     # FastAPI
```

### tmux 세션 (운영)

```bash
# tmux blog 세션에서 4개 윈도우:
# api(8001) + telegram + worker + web(3002)
```

---

## 10. 환경변수

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

## Changelog

| 날짜 | 버전 | 변경 |
|------|------|------|
| 2026-03-12 | **3.0** | 문서 7개 통합 (단일 진실 공급원). W6~W7~P3 반영. 이중 제어 블록다이어그램 추가 |
| 2026-03-06 | 2.0 | 기존 문서 4개 통합, 재생성 API, 보안 수정 반영 |
| 2026-03-05 | 1.0 | Phase 0 초기 설계 |

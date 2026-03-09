# TASK — 작업 현황

> 실시간 갱신. 작업 착수/완료/발견 시 즉시 반영.
> 상세 작업 문서: `docs/프로젝트/tasks/` 디렉토리

---

## 프로젝트 방향 전환 (2026-03-06)

**기존**: 로컬 Python 스크립트 + 텔레그램 봇 (개인 도구)
**새 방향**: **웹 플랫폼(홈페이지)** — AI 블로그 글쓰기 파트너

- 인성이 전용 MVP → 사용자 확장
- 자동 발행 ❌ → AI와 함께 글쓰기 ✅ (사용자가 직접 게시)
- 댓글 봇은 별도 로컬 운영 유지

### 아키텍처

```
웹 플랫폼 (Next.js 14 + Vercel)
├── 프론트: 로그인, 대시보드, AI 글쓰기 에디터, 댓글 봇 관리(/bot)
├── 백엔드: Next.js API Routes (Claude API + Bot 제어)
├── DB/Auth/Storage: Supabase
└── AI: Anthropic TS SDK (Vision + Sonnet + Haiku)

Supabase (공유 제어 평면)
├── pending_comments  ← 웹·텔레그램 양쪽에서 승인/거부
├── bot_settings      ← 봇 설정 (시간대, 한도, 모드)
└── bot_run_log       ← 실행 이력 (상태 대시보드)

로컬 (봇 운영)
├── 댓글 봇 (Python + Cron) → Supabase 제어 평면 읽기/쓰기
├── SQLite (운영 데이터: comment_history, visit_log, behavior)
└── 텔레그램 봇 → Supabase 제어 평면 읽기/쓰기
```

---

## 현재 진행 중

| # | 작업 | 중요도 | 상태 | 문서 |
|---|------|--------|------|------|
| W7 | 웹 봇 제어 + 쿠키 양방향 동기화 (Command Queue 패턴) | P1 | ✅ 완료 | 하단 W7 섹션 |
| W6 | 댓글 봇 웹 통합 — 텔레그램+웹 이중 제어 (Supabase 제어 평면 이관) | P1 | ✅ 완료 | `tasks/W6-댓글봇-웹통합.md` |
| W5 | 페르소나 학습 파이프라인 — 전체 완료 (01~07) | P1 | ✅ 완료 | `tasks/W5-페르소나.md` |
| W4-05 | 3티어 사용량 제한 시스템 (무료 10/월, 베이직 50/월, 프로 200/월) | P1 | ✅ 완료 | — |
| W4-03 | 인성이 실사용 테스트 + 버그 수정 (코드리뷰 7건 수정 완료) | P2 | ✅ 완료 | — |
| LOC-01 | 로컬 봇 Phase 2+3 완성 (STEP 1~4) | P2 | ✅ 완료 | — |

---

## 웹 플랫폼 로드맵

### W1: 인프라 세팅 — ✅ 완료

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| W1-01 | Supabase 프로젝트 생성 + .env.local 설정 | ✅ 완료 | 03-06 |
| W1-02 | DB 마이그레이션 실행 (users, credentials, queue) | ✅ 완료 | SQL Editor 수동 실행 |
| W1-03 | Supabase Storage 버킷 생성 (photos) | ✅ 완료 | REST API 생성 + RLS/정책 SQL 실행 완료 |
| W1-04 | lib/supabase.ts 클라이언트 설정 | ✅ 완료 | browser + server + admin + types |
| W1-05 | 레이아웃 + 메타데이터 한국어화 | ✅ 완료 | lang="ko" |

### W2: 인증 + 대시보드

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| W2-01 | Supabase Auth 로그인/회원가입 페이지 | ✅ 완료 | 로그인+회원가입 토글, 에러 표시 |
| W2-02 | 미들웨어 — 비로그인 시 리다이렉트 | ✅ 완료 | /dashboard, /write 보호 |
| W2-03 | 대시보드 레이아웃 (헤더/내비) + UI 셸 | ✅ 완료 | 로그아웃 실제 동작 연결 |
| W2-04 | 내 글 목록 페이지 (generation_queue 조회) | ✅ 완료 | mock → Supabase 전환 완료 (03-06) |
| W2-05 | Role 기반 접근제어 유틸리티 | ✅ 완료 | useUser 훅 + isAdmin (03-06) |

### W3: AI 글쓰기 (핵심)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| W3-01 | 사진 업로드 UI + Supabase Storage 연동 | ✅ 완료 | write/page.tsx (03-06) |
| W3-02 | 메모 입력 + 카테고리 선택 UI | ✅ 완료 | write/page.tsx (03-06) |
| W3-03 | AI 초안 생성 API Route (/api/generate) | ✅ 완료 | content_generator.py TS 포팅 (03-06) |
| W3-04 | 초안 렌더링 + 편집기 UI | ✅ 완료 | [PHOTO_N] 플레이스홀더 → 이미지 미리보기 (03-06) |
| W3-05 | 저장 + 복사하기 기능 | ✅ 완료 | generation_queue INSERT + clipboard (03-06) |
| W3-06 | 텔레그램→Supabase 통합 | ✅ 완료 | source 컬럼 + supabase_client.py + telegram_bot.py 연동 (03-06) |

### W4: 마무리 + 보안 강화 — ✅ 핵심 완료

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| W4-01 | 재생성 기능 (피드백 → 수정된 초안) | ✅ 완료 | `regeneratePost()` + `/api/regenerate` + UI 연동 (03-06) |
| W4-02 | 코드 리뷰 + 보안 수정 (7건) | ✅ 완료 | Open redirect 수정, getSession→getUser, 타입 안전성 (03-06) |
| W4-03 | 인성이 실사용 테스트 + 버그 수정 | ✅ 완료 | 코드리뷰 7건 수정 + reserve_generation RPC 추가 (03-08) |
| W4-04 | 사용자 확장 준비 (회원가입 오픈 + OAuth) | 대기 | OAuth는 나중에 (provider 콘솔 필요) |
| W4-05 | 3티어 사용량 제한 시스템 | ✅ 완료 | `lib/tier.ts` + generate/regenerate 적용 + UI 사용량 표시 (03-07) |

#### W4-02 보안 수정 상세 (03-06)

| 심각도 | 이슈 | 수정 |
|--------|------|------|
| CRITICAL | Open redirect — login redirect 파라미터 검증 없음 | `startsWith("/") && !startsWith("//")` 검증 추가 |
| HIGH | `getSession()` → `getUser()` | generate, regenerate API Route에서 서버사이드 JWT 검증으로 전환 |
| MEDIUM | database.types.ts Insert 타입 제한적 | 모든 status 값 + generated_* 필드 허용 |
| MEDIUM | 불필요한 타입 캐스트 (dashboard) | 직접 `post.source` 접근으로 변경 |
| LOW | 변수 쉐도잉 (write/page.tsx) | `uploadedPaths` → `paths` 로컬 변수명 변경 |
| LOW | 복사 피드백 없음 | `copyLabel` state로 "복사됨!" 2초 표시 |

### W5: 페르소나 학습 파이프라인 — ✅ 완료

> 블로그 URL → 크롤링(HTML 메타데이터 포함) → AI 분석 → DB 페르소나 → HTML 렌더러 → 피드백 루프
> 상세 설계: `docs/프로젝트/tasks/W5-페르소나.md`

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| W5-01 | DB 마이그레이션 (user_personas, persona_items, persona_feedback) | ✅ 완료 | 03-07 SQL Editor 실행 완료 |
| W5-02 | 크롤링 API Route (`/api/persona/crawl`) | ✅ 완료 | `lib/crawl/naver-blog.ts` + `api/persona/crawl/route.ts` (03-07) |
| W5-03 | AI 분석 (`lib/ai/analyze-persona.ts`) — 2-pass | ✅ 완료 | `analyze-persona.ts` + `api/persona/analyze/route.ts` (03-07) |
| W5-04 | 페르소나 관리 UI (`/persona`) | ✅ 완료 | 아코디언 7카테고리, 토글/삭제/직접추가, 크롤링+분석 트리거 (03-07) |
| W5-05A | generate-post.ts DB 연동 | ✅ 완료 | `loadUserPersona()` + `renderPersonaToPrompt()` + API Route userId 전달 (03-07) |
| W5-05B | **HTML 렌더러** (`lib/render/naver-html.ts`) | ✅ 완료 | 인라인 CSS HTML, **볼드 마커, 빈 줄 간격, 폰트 매핑 (03-07) |
| W5-05C | UI "HTML 복사" 버튼 | ✅ 완료 | `ClipboardItem` + formatting 항목 로드 + `renderPostHtml()` (03-07) |
| W5-06 | 피드백→DB 저장 + 패턴 분석 + 승인 UI | ✅ 완료 | `analyze-feedback.ts` + regenerate 연동 + feedback API + persona UI 피드백 섹션 (03-08) |
| W5-07 | 문서화 | ✅ 완료 | CODE_MAP.md 반영 (03-08) |

#### 설계 결정 사항 (03-06 논의 + 03-07 확정)

- **크롤링 방식**: 모바일 URL(`m.blog.naver.com`) + cheerio (서버리스 호환)
- **페르소나 관계**: 1 user : 1 persona (UNIQUE 제약)
- **항목 카테고리 7개**: voice, emoji, structure, ending, forbidden, custom, **formatting**
- **항목 출처 추적**: ai (크롤링), user (직접 추가), feedback (피드백 도출)
- **피드백 규칙 적용**: 자동 아닌 사용자 승인 후 적용
- **AI 분석 모델**: Sonnet (1회성 분석, 정확도 우선)
- **HTML 렌더러**: formatting 항목 기반 SmartEditor HTML 생성 → 유사도 80~90% 목표
- **구현 순서**: W5-01 → 02 → 03 → 05B → 05A → 04 → 05C → 06 → 07

---

## 제거/보류 항목

| 기존 작업 | 판단 | 사유 |
|----------|------|------|
| Phase 2 스마트에디터 셀렉터 | 🔧 테스트 필요 | STEP 5: DOM 덤프 → 셀렉터 업데이트 (브라우저 실행 필요) |
| publisher_main.py | 🔧 테스트 필요 | 셀렉터 업데이트 후 --dry-run 테스트 |
| validate_selectors.py | 🗑️ 제거 | debug_publisher.py --validate로 대체 |
| QUALITY-REPORT | 📦 보류 | 댓글 봇 P3, 웹 플랫폼 완성 후 |
| HTML-LAYOUT | 📦 보류 | 웹 에디터로 대체 |
| AUTO-REPLY-COLLECT | 📦 보류 | 댓글 봇 P3 |

---

## 댓글 봇 (로컬 운영 + 웹 통합 예정)

> W6에서 제어 평면을 Supabase로 이관 → 웹+텔레그램 이중 제어 가능하게 전환.

| 서비스 | 상태 | 비고 |
|--------|------|------|
| 댓글 봇 (Cron) | ✅ 등록됨 | 평일 20:30, 주말 13:30 |
| 텔레그램 봇 | ✅ 실행 중 | tmux blog:telegram (03-08 재시작) |
| API 서버 | ✅ 실행 중 | tmux blog:api, 포트 8001 (03-08 재시작) |
| 웹 대시보드 (/bot) | ✅ 완료 | 상태·승인·설정 통합 UI |

### W6: 댓글 봇 웹 통합 — ✅ 완료

> 제어 평면(승인, 설정, 상태)을 Supabase로 이관 → 텔레그램+웹 이중 제어
> 상세 설계: `docs/프로젝트/tasks/W6-댓글봇-웹통합.md`

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| W6-01 | DB 마이그레이션 (pending_comments, bot_settings, bot_run_log) | ✅ 완료 | SQL Editor 실행 완료 (03-07) |
| W6-02 | supabase_client.py 확장 (제어 함수 추가) | ✅ 완료 | 9개 함수 추가 (03-07) |
| W6-03 | orchestrator.py Supabase 연동 | ✅ 완료 | 설정 로드 + 이중 기록 (03-07) |
| W6-04 | 텔레그램 봇 Supabase 전환 | ✅ 완료 | telegram_bot.py + _simple.py 전환 (03-07) |
| W6-05 | 웹 API Routes (/api/bot/*) | ✅ 완료 | pending·status·settings 3개 Route (03-07) |
| W6-06 | 웹 UI — `/bot` 페이지 | ✅ 완료 | 상태 카드 + 승인 대기 + 설정 + 이력 (03-07) |
| W6-07 | SQLite pending/settings 제거 + 정리 | ✅ 완료 | database.py, time_guard.py, api_server.py 전환 (03-08) |

---

## ✅ 완료 작업 아카이브

<details>
<summary>2026-03-05 이전 완료 (클릭해서 펼치기)</summary>

| 작업 | 내용 | 날짜 |
|------|------|------|
| TG-EXEC | 승인 댓글 일괄 실행 | 03-05 |
| TG-BUTTON | Inline Keyboard 콜백 수정 | 03-05 |
| LOGIN-KEEP | 로그인 세션 유지 | 03-05 |
| REJECTED-FIX | 거부 댓글 처리 수정 | 03-05 |
| CRON-SET | Cron 스케줄 설정 | 03-05 |
| RETRY-QUEUE | 재시도 큐 처리 | 03-05 |
| PROMPT-V2 | 댓글 AI 프롬프트 v2 | 03-05 |
| HTML-AUTO | HTML 초안 자동 전송 | 03-05 |
| AUTO-BLOGGER | 오토 블로거 추적 기능 | 03-05 |
| LOGIN-RETRY | 로그인 자동 복구 | 03-05 |

</details>

---

### 보안 개선 (2026-03-08)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| SEC-01 | `user_credentials` 테이블 삭제 (ID/PW 저장 제거) | ✅ 완료 | migration 00009 |
| SEC-02 | 쿠키 업로드 기능 (웹 → Supabase → 봇) | ✅ 완료 | migration 00010 + API + UI + Python 연동 |
| SEC-03 | 배치 댓글 생성 (3개 묶어서 API 1회) | ✅ 완료 | `generate_comments_batch()` + orchestrator 3단계 |

### UX 개선 (2026-03-08)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| UX-01 | 글쓰기 이탈 경고 — 작성 중 페이지 이동 시 확인 대화상자 | ✅ 완료 | beforeunload + pushState 패치 + popstate 3종 |
| UX-02 | 저장된 글 불러오기 — 대시보드에서 완료 글 클릭 → `/write?id=xxx` 복원 | ✅ 완료 | useSearchParams + Suspense + signed URLs |
| UX-03 | HTML 복사 signed URL 적용 — private 버킷 사진 403 수정 | ✅ 완료 | createSignedUrls 캐싱 (user gesture 유지) |
| UX-04 | HTML 렌더러 SmartEditor 내부 구조 복제 | ✅ 완료 | se-component/se-text-paragraph 래퍼 + inline CSS 병행 |
| UX-05 | formatting 항목 DB 누락 수정 — 크롤링 데이터 기반 수동 INSERT | ✅ 완료 | nanumbareunhipi + fs16 (블로그 실제 스타일 반영) |

### 관리자 페이지 (2026-03-08)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| ADM-01 | 관리자 API Route (`/api/admin/users`) — GET 목록 + PATCH 수정 | ✅ 완료 | admin role 검증 + createAdminClient |
| ADM-02 | 관리자 페이지 UI (`/admin`) — 통계 카드 + 사용자 테이블 | ✅ 완료 | tier 드롭다운 + status 토글 |
| ADM-03 | Header 관리 링크 조건부 표시 | ✅ 완료 | isAdmin 상태 + users 테이블 조회 |
| ADM-04 | Middleware `/admin` 보호 경로 추가 | ✅ 완료 | protectedPaths + matcher |

### 로컬 봇 Phase 2+3 완성 (2026-03-09)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| LOC-01 | orchestrator.py — auto/manual 분기 + retry_queue 처리 통합 | ✅ 완료 | `_process_retry_queue()` 신규 |
| LOC-02 | telegram_bot_simple.py — /status, /retry, /retry_now 명령어 추가 | ✅ 완료 | 3→6개 명령어 |
| LOC-03 | api_server.py — POST /comment/retry + GET /status 확장 | ✅ 완료 | RetryResponse 모델 신규 |
| LOC-04 | debug_publisher.py — --validate 모드 (blog_publisher.py 셀렉터 검증) | ✅ 완료 | `_validate_publisher_selectors()` 신규 |
| LOC-05 | blog_publisher.py — 셀렉터 업데이트 (DOM 덤프 분석 후) | 대기 | 브라우저 실행 필요 |

### 댓글 봇 개선 (2026-03-08)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| BOT-01 | 이중 체크 — DB + 페이지 내 댓글 존재 확인 병행 | ✅ 완료 | `_check_my_comment()` + `[비교]` 로그 태그 |
| BOT-02 | 오토블로거 필터 → 로그 전환 (스킵 안 함, 데이터 수집) | ✅ 완료 | `[데이터]` 태그로 점수 기록 |

---

## P0/P2/P3 일괄 작업 (2026-03-09)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| BUG-01 | formatting 항목 DB 저장 실패 근본 원인 수정 | ✅ 완료 | Pass 2 재시도 + 분리 저장 + 경고 반환 |
| BUG-02 | 글 삭제 기능 (대시보드 삭제 버튼 + API) | ✅ 완료 | `DELETE /api/posts?id=`, Storage 사진 동시 삭제 |
| BUG-03 | 글 제목/본문 직접 편집 기능 | ✅ 완료 | 미리보기↔편집 토글, textarea, 수정 저장(`PATCH /api/posts`) |
| UX-06 | 사진 순서 드래그 변경 | ✅ 완료 | HTML5 DnD, 네이티브 구현 (라이브러리 없음) |
| UX-07 | 초안 직접 편집 | ✅ 완료 | BUG-03과 통합 |
| UX-09 | 이미지 압축/리사이즈 (업로드 전 클라이언트 처리) | ✅ 완료 | `lib/image-compress.ts`, max 1920px, JPEG 0.8 |
| EXT-01 | 글 히스토리 (버전 관리) | ✅ 완료 | `versions` JSONB 컬럼 + 버전 전환 UI (migration 00011) |

---

## 다음 작업 백로그

### P1: 사용자 확장 전 필수

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| DEPLOY-01 | Vercel 프로덕션 배포 (환경변수 + 도메인) | 대기 | 현재 localhost만 |
| LANDING-01 | 랜딩 페이지 (서비스 소개 + 사용 예시 + 가입 유도) | 대기 | 현재 카드 1개 |
| MOBILE-01 | 모바일 반응형 (write 페이지 핵심) | 대기 | 블로거 대다수 모바일 사진 촬영 |
| ONBOARD-01 | 신규 가입자 온보딩 플로우 (가입→블로그URL→크롤링→첫 글) | 대기 | 현재 수동으로 /persona 이동 필요 |

### P2: 사용성 개선 (잔여)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| UX-08 | 카테고리별 프롬프트 커스텀 | ✅ 완료 | persona_items category_prompt + generate-post.ts 주입 + 페르소나 상세 UI (03-09) |
| CAL-01 | 캘린더 클릭→글 보기 | ✅ 완료 | dayPosts 클릭 + 모달 "글 보기" 버튼 (03-09) |

### P3: 확장 기능 — ✅ 전체 완료

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| EXT-02 | 콘텐츠 캘린더 (주제 예약 + 발행 스케줄) | ✅ 완료 | 월별 그리드 + CRUD + write 연동 (03-09) |
| EXT-03 | 성과 분석 (조회수/댓글/좋아요 추적) | ✅ 완료 | recharts 차트 + 네이버 크롤링 + 시계열 DB (03-09) |
| EXT-04 | 다중 페르소나 (1인 다계정/스타일 전환) | ✅ 완료 | UNIQUE 제거 + is_default + 목록/상세 UI (03-09) |
| EXT-05 | OAuth 소셜 로그인 (Kakao/Naver) | 📦 보류 | 코드+DB 준비됨, 개발자 콘솔 앱 등록 미완. 사용자 확장 시 진행 |

### W7: 웹 봇 제어 + 쿠키 양방향 동기화 — ✅ 완료

> 웹에서 버튼 클릭으로 봇 실행/댓글 게시/재시도 트리거 + 쿠키 양방향 동기화
> 아키텍처: Command Queue (Supabase 폴링) — ngrok 불필요

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| W7-01 | DB 마이그레이션 (`bot_commands` 테이블 + RLS) | ✅ 완료 | `00016_bot_commands.sql` SQL Editor 실행 (03-09) |
| W7-02 | 쿠키 양방향 동기화 (로컬→Supabase 역업로드) | ✅ 완료 | `save_bot_cookies_sb()` + `_save_cookies()` 수정 (03-09) |
| W7-03 | 웹 API Route (`/api/bot/command`) POST+GET | ✅ 완료 | 중복 방지(409) + 최근 5개 조회 (03-09) |
| W7-04 | 명령 큐 워커 (`command_worker.py`) | ✅ 완료 | 10초 폴링, run/execute/retry 핸들러 (03-09) |
| W7-05 | 웹 UI 봇 제어 카드 (`/bot` 페이지) | ✅ 완료 | 버튼 3개 + 5초 폴링 + 경과 시간 + 결과 표시 (03-09) |
| W7-06 | `start_services.sh` worker 창 추가 | ✅ 완료 | tmux blog:worker (03-09) |
| W7-07 | E2E 테스트 (웹 버튼 → 워커 실행 → 결과 표시) | ✅ 완료 | pending→running→completed 전이 확인 (03-09) |

*마지막 업데이트: 2026-03-09 (W7 웹 봇 제어 + 쿠키 양방향 동기화)*

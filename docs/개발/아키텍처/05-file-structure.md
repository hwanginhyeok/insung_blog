# 📁 파일 구조 명세

> **버전**: 1.0  
> **기준**: Phase 0 (Multi-tenant MVP)  
> **변경 시**: 본 파일 먼저 수정 후 코드 변경

---

## 🗂️ 전체 디렉토리 트리

```
인성이프로젝트/
├── 📁 apps/                          # 애플리케이션 모노레포
│   ├── 📁 web/                       # Next.js 14 (Vercel 배포)
│   │   ├── 📁 app/                   # App Router
│   │   │   ├── 📁 (dashboard)/       # 그룹 라우트
│   │   │   │   ├── 📁 [userId]/      # 동적 세그먼트
│   │   │   │   │   ├── 📄 page.tsx   # 사용자 대시보드
│   │   │   │   │   ├── 📁 history/   # 히스토리 페이지
│   │   │   │   │   │   └── 📄 page.tsx
│   │   │   │   │   └── 📁 settings/  # 설정 페이지
│   │   │   │   │       └── 📄 page.tsx
│   │   │   │   └── 📄 layout.tsx     # 대시보드 레이아웃
│   │   │   ├── 📁 api/               # API Routes
│   │   │   │   ├── 📁 auth/
│   │   │   │   │   └── 📁 [...nextauth]/
│   │   │   │   │       └── 📄 route.ts
│   │   │   │   ├── 📁 generate/
│   │   │   │   │   └── 📄 route.ts   # 글 생성 요청
│   │   │   │   ├── 📁 jobs/
│   │   │   │   │   └── 📁 [id]/
│   │   │   │   │       └── 📄 route.ts  # Job 상태 조회
│   │   │   │   └── 📁 webhooks/
│   │   │   │       └── 📁 job-complete/
│   │   │   │           └── 📄 route.ts  # Worker 콜백
│   │   │   ├── 📁 login/
│   │   │   │   └── 📄 page.tsx       # 로그인 페이지
│   │   │   ├── 📄 layout.tsx         # 루트 레이아웃
│   │   │   └── 📄 page.tsx           # 랜딩/온보딩
│   │   ├── 📁 components/            # React 컴포넌트
│   │   │   ├── 📁 ui/                # shadcn/ui 컴포넌트
│   │   │   ├── 📁 forms/             # 폼 컴포넌트
│   │   │   │   ├── 📄 GenerateForm.tsx
│   │   │   │   └── 📄 FeedbackForm.tsx
│   │   │   ├── 📁 dashboard/         # 대시보드 전용
│   │   │   │   ├── 📄 StatCards.tsx
│   │   │   │   ├── 📄 RecentPosts.tsx
│   │   │   │   └── 📄 DNACard.tsx
│   │   │   └── 📁 common/            # 공통
│   │   │       ├── 📄 Header.tsx
│   │   │       └── 📄 Sidebar.tsx
│   │   ├── 📁 lib/                   # 유틸리티
│   │   │   ├── 📄 supabase.ts        # Supabase 클라이언트
│   │   │   ├── 📄 auth.ts            # 인증 유틸
│   │   │   └── 📄 constants.ts       # 상수
│   │   ├── 📁 hooks/                 # React Hooks
│   │   │   ├── 📄 useUser.ts
│   │   │   ├── 📄 useGeneration.ts
│   │   │   └── 📄 useRealtime.ts     # Supabase Realtime
│   │   ├── 📁 types/                 # TypeScript 타입
│   │   │   └── 📄 index.ts
│   │   ├── 📄 middleware.ts          # Next.js 미들웨어
│   │   ├── 📄 next.config.js
│   │   ├── 📄 tailwind.config.ts
│   │   └── 📄 package.json
│   │
│   └── 📁 worker/                    # Python Worker (로컬 실행)
│       ├── 📄 main.py                # 진입점
│       ├── 📄 config.yaml            # Worker 설정
│       ├── 📁 core/                  # 핵심 로직
│       │   ├── 📄 __init__.py
│       │   ├── 📄 poller.py          # Supabase 폴링
│       │   ├── 📄 executor.py        # Job 실행기
│       │   ├── 📄 session.py         # UserSession 관리
│       │   └── 📄 reporter.py        # 결과 보고
│       ├── 📁 services/              # 외부 서비스 연동
│       │   ├── 📄 __init__.py
│       │   ├── 📄 supabase_client.py
│       │   ├── 📄 claude_api.py      # AI 글 생성
│       │   ├── 📄 naver_browser.py   # Playwright 래퍼
│       │   └── 📄 telegram_bot.py    # 알림 (선택)
│       ├── 📁 models/                # 데이터 모델
│       │   ├── 📄 __init__.py
│       │   ├── 📄 user.py
│       │   └── 📄 job.py
│       ├── 📁 utils/                 # 유틸리티
│       │   ├── 📄 __init__.py
│       │   ├── 📄 crypto.py          # 암호화
│       │   ├── 📄 logger.py
│       │   └── 📄 validators.py
│       ├── 📁 tests/                 # 테스트
│       │   └── 📄 test_session.py
│       └── 📄 requirements.txt
│
├── 📁 packages/                      # 공유 패키지 (추후)
│   └── 📁 shared-types/              # TypeScript/Python 공유 타입
│
├── 📁 supabase/                      # DB 마이그레이션
│   ├── 📁 migrations/
│   │   ├── 📄 00001_create_users.sql
│   │   ├── 📄 00002_create_queue.sql
│   │   ├── 📄 00003_create_dna.sql
│   │   └── 📄 00004_setup_rls.sql
│   └── 📄 seed.sql                   # 초기 데이터 (형 계정)
│
├── 📁 docs/                          # 문서
│   ├── 📁 개발/                      # 개발 문서 (본 디렉토리)
│   │   ├── 📄 README.md
│   │   ├── 📁 아키텍처/
│   │   ├── 📁 API/
│   │   ├── 📁 DB/
│   │   ├── 📁 UI/
│   │   ├── 📁 배포/
│   │   └── 📁 작업로그/
│   └── 📁 프로젝트/                  # 기존 프로젝트 문서
│
├── 📁 scripts/                       # 유틸리티 스크립트
│   ├── 📄 setup.sh                   # 초기 설정
│   ├── 📄 deploy-web.sh              # Vercel 배포
│   ├── 📄 db-reset.sh                # DB 리셋
│   └── 📁 migrations/                # 데이터 마이그레이션
│
├── 📁 .github/                       # GitHub 설정
│   └── 📁 workflows/
│       ├── 📄 web-ci.yml             # Vercel 자동 배포
│       └── 📄 worker-release.yml     # Worker 릴리즈
│
├── 📄 .env.example                   # 환경변수 템플릿
├── 📄 .env.local.example             # 로컬 환경변수
├── 📄 turbo.json                     # Turborepo 설정
├── 📄 package.json                   # 루트 패키지
└── 📄 README.md                      # 프로젝트 소개
```

---

## 📄 핵심 파일 설명

### Web (Next.js)

| 파일 | 역할 | 수정 주의사항 |
|------|------|--------------|
| `apps/web/app/api/generate/route.ts` | 글 생성 API 엔드포인트 | Rate limit, Validation 체크 |
| `apps/web/app/api/webhooks/job-complete/route.ts` | Worker 완료 콜백 | 보증 검증 필수 |
| `apps/web/lib/supabase.ts` | DB 클라이언트 설정 | Service Role Key 노출 금지 |
| `apps/web/middleware.ts` | 인증/인가 미들웨어 | Matcher 정확히 설정 |

### Worker (Python)

| 파일 | 역할 | 수정 주의사항 |
|------|------|--------------|
| `apps/worker/main.py` | Worker 진입점 | 예외 처리 필수 |
| `apps/worker/core/session.py` | 사용자 세션 격리 | 쿠키 경로 확인 |
| `apps/worker/services/naver_browser.py` | 네이버 자동화 | 셀렉터 변경 시 업데이트 |
| `apps/worker/config.yaml` | Worker 설정 | Git에 커밋 금지 (민감정보) |

### Database

| 파일 | 역할 | 실행 시점 |
|------|------|----------|
| `supabase/migrations/00001_create_users.sql` | 사용자 테이블 생성 | 초기 1회 |
| `supabase/migrations/00004_setup_rls.sql` | RLS 정책 설정 | 초기 1회 |
| `supabase/seed.sql` | 형 계정 초기 데이터 | 개발/배포 시 |

---

## 🔐 민감 파일 관리

### `.gitignore` 필수 항목

```gitignore
# Worker
apps/worker/config.yaml              # Worker 설정 (user_id 매핑)
apps/worker/cookies/*/               # 사용자 쿠키
apps/worker/logs/                    # 로컬 로그
apps/worker/*.log

# Web
apps/web/.env.local                  # 로컬 환경변수
apps/web/.env.production

# Database
supabase/seed.sql                    # 초기 데이터 (형 계정 정보)

# Common
.env
*.pem
*.key
```

### 환경변수 파일 구분

| 파일 | 사용처 | 예시 항목 |
|------|--------|----------|
| `.env.example` | 템플릿 | `SUPABASE_URL=`, `NEXTAUTH_SECRET=` |
| `.env.local` | 로컬 개발 | 실제 키 (Git 제외) |
| Vercel Environment | 프로덕션 | Dashboard에서 설정 |
| `worker/.env` | Worker | `SUPABASE_SERVICE_KEY`, `CLAUDE_API_KEY` |

---

## 🔄 파일 변경 시 체크리스트

### 파일 추가 시
- [ ] `docs/개발/아키텍처/05-file-structure.md` 업데이트
- [ ] `.gitignore` 확인 (민감 파일 여부)
- [ ] `README.md` 또는 관련 문서에 설명 추가
- [ ] TypeScript 타입 정의 (`packages/shared-types` 또는 `apps/web/types`)

### 파일 삭제 시
- [ ] 의존성 체크 (import 하는 곳 확인)
- [ ] 문서에서 참조 제거
- [ ] 마이그레이션 스크립트 필요 시 작성

### 파일 이동/리네임 시
- [ ] import 경로 전체 수정
- [ ] 문서 내 경로 업데이트
- [ ] Git history 유지 (git mv 사용 권장)

---

## 📊 현재 파일 상태

| 영역 | 파일 수 | 상태 | 비고 |
|------|---------|------|------|
| Web | 0 | 🚧 미생성 | Phase 0에서 생성 예정 |
| Worker | 0 | 🚧 미생성 | 기존 코드 마이그레이션 필요 |
| DB Migration | 0 | 🚧 미생성 | Supabase CLI로 생성 예정 |
| Docs | 2 | ✅ 생성됨 | `README.md`, `00-system-overview.md` |

---

## Changelog

- **2026-03-05**: Phase 0 파일 구조 정의
- **Status**: Draft, Phase 0 개발 시작 시 확정

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

### 테스트 & 검증 (수동 테스트 필요)

| # | 작업 | 중요도 | 상태 | 비고 |
|---|------|--------|------|------|
| TG-E2E | 텔레그램 봇 통합 E2E 테스트 | P0 | 대기 | 텔레그램 앱에서 수동 테스트 필요 |
| TEST | 기능별 통합 테스트 (아래 상세) | P0 | 부분완료 | 2026-03-23 E2E 진행 — 아래 상세 |
| BLOG-AUTO | 네이버 블로그 글 자동화 기능 (AI 글 생성 → 네이버 자동 발행 파이프라인) | P2 | 예정 | 기존 PUBLISH(수동 발행) 확장 — 주제 선정→초안 생성→발행까지 자동화 |
| COOKIE-FIX | 쿠키 저장 시 NID_AUT 유실 방지 | P1 | 대기 | ensure_login 성공 후 context.cookies()에서 NID_AUT 빠지는 현상. _save_cookies_for_user에서 NID_AUT 검증 추가 필요 |

> **잔여 E2E 항목** (TEST 섹션에 통합)
> - PUB-08: 저장→발행→URL E2E (워커+브라우저)
> - MULTI-USER: 2번째 사용자 E2E (가입→쿠키→blog_id 자동 감지→봇 실행)
> - NEIGHBOR: 서로이웃 신청 E2E (웹 폼 → 워커 실행 → DB 기록)
> - TG-E2E: 텔레그램 봇 통합 E2E (`.claude/skills/telegram-bot-test.md`)

### 기능 개선 (코드 작업)

| # | 작업 | 중요도 | 상태 | 비고 |
|---|------|--------|------|------|
| SAVE-DRAFT | 네이버 블로그 임시저장 기능 (HTML 주입 + 임시저장) | P1 | ✅ 구현완료 | E2E 테스트 필요 (브라우저+워커) |
| WORKER-CMD | command_worker에 추천/동기화/테마분석 명령 핸들러 추가 | P1 | 대기 | 웹에서 트리거 가능하게 |
| ADMIN-BOT-DETAIL | UserDetailModal에 봇 실행 이력 탭 추가 | P2 | 대기 | 상세 일별 차트 + 로그 테이블 |
| NAV-MOBILE | 드롭다운 메뉴 모바일 반응형 검증 및 수정 | P2 | 대기 | 야간 작업에서 NAV-LAYOUT 후속 |
| NEIGHBOR-E2E | 이웃 연동 기능 실행 테스트 | P1 | 대기 | 브라우저 필요 — 추천/동기화/테마분석 E2E |

### 자동화 파이프라인

| # | 작업 | 중요도 | 상태 | 비고 |
|---|------|--------|------|------|
| STOCK-BLOG | 주식 시황분석 → 블로그 자동 발행 (cron 07:00/19:00) | P1 | 대기 | 아래 세부 참조 |

### 인프라 & 안정성

| # | 작업 | 중요도 | 상태 | 비고 |
|---|------|--------|------|------|
| INFRA-SERVER | 로컬 PC 의존 탈피 — 클라우드 서버 이전 | P0 | 대기 | 아래 세부 참조 |
| SUPABASE-PRO | Supabase Pro 플랜 전환 검토 — Storage 유저 6명에서 한도 도달 | P1 | 대기 | 무료 1GB → Pro 8GB, 비용/이점 비교 |

## STOCK-BLOG: 주식 시황분석 → 블로그 자동 발행

> stock 프로젝트 시황분석 결과를 네이버 블로그에 자동 게시. cron으로 매일 07:00 / 19:00 실행.

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| SB-01 | stock 프로젝트 시황분석 출력 포맷 확인 및 연동 인터페이스 설계 | 대기 | ~/stock/ 분석 결과 형식 파악 |
| SB-02 | 시황분석 글 → 블로그 포맷 변환 (제목/본문/해시태그 생성) | 대기 | AI 가공 또는 템플릿 |
| SB-03 | 자동 발행 스크립트 작성 (분석→변환→발행 파이프라인) | 대기 | publisher_main.py 연동 |
| SB-04 | cron 등록 (매일 07:00, 19:00) | 대기 | crontab 설정 |
| SB-05 | 발행 실패 시 알림 (텔레그램 알림 연동) | 대기 | telegram_notifier 활용 |
| SB-06 | E2E 테스트 (시황분석 → 블로그 게시 확인) | 대기 | dry-run 먼저 |

## INFRA-SERVER: 클라우드 서버 이전

> 현재 로컬 PC(WSL2)에서 봇 서비스 운영 중 — PC 꺼지면 전체 다운.
> 클라우드 이전으로 24/7 안정성 확보.

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| IS-01 | 클라우드 플랫폼 선정 (AWS/Oracle/Vultr 비교) | 대기 | 아래 제안 참조 |
| IS-02 | 서버 환경 구축 (Python 3.12 + Playwright + 의존성) | 대기 | Docker 컨테이너 또는 직접 설치 |
| IS-03 | 코드/설정 배포 자동화 (git pull + systemd 서비스) | 대기 | start_services.sh → systemd unit |
| IS-04 | 환경변수/.env 이관 | 대기 | 시크릿 매니저 또는 직접 복사 |
| IS-05 | 서비스 모니터링 + 자동 재시작 | 대기 | systemd watchdog 또는 healthcheck |
| IS-06 | 장애 시 텔레그램 알림 | 대기 | 프로세스 다운 감지 → 즉시 알림 |

### 클라우드 플랫폼 비교

| 플랫폼 | 사양 | 월 비용 | 장점 | 단점 |
|--------|------|---------|------|------|
| **Oracle Cloud Free** | ARM 4코어/24GB | **무료** | 평생 무료, 넉넉한 사양 | 가입 어려움, Playwright ARM 호환 확인 필요 |
| **AWS Lightsail** | 2코어/2GB | ~$10 | 안정적, 문서 풍부 | 스펙 대비 비쌈 |
| **AWS EC2 t3.small** | 2코어/2GB | ~$15 | 유연한 스케일링 | 관리 복잡 |
| **Vultr/Hetzner** | 2코어/4GB | ~$6-8 | 가성비, 빠른 셋업 | 한국 리전 없음(Vultr 도쿄 있음) |

> **추천**: Oracle Cloud Free (무료+고사양) 먼저 시도 → 실패 시 Vultr 도쿄

## ADMIN-BOT-STATS: 관리자 페이지 봇 사용현황

> 관리자가 유저별 댓글봇 운영 상태를 한눈에 파악.

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| ABS-01 | API — 유저별 봇 실행 통계 (성공/실패/총횟수/마지막 실행) | 대기 | bot_run_log + pending_comments 집계 |
| ABS-02 | API — 유저별 댓글 게시/실패 카운트 (기간별) | 대기 | pending_comments status 집계 |
| ABS-03 | 관리자 UI — 사용자 목록에 봇 상태 뱃지 추가 | 대기 | 활성/비활성/에러 표시 |
| ABS-04 | 관리자 UI — 사용자 상세 모달에 봇 실행 이력 탭 | 대기 | 일별 차트 + 로그 테이블 |

## SCALABILITY: 확장성 점검 — ✅ 완료 (2026-03-22)

> 고객 증가 대비 시스템 확장성 재점검. 리포트: `docs/프로젝트/reports/scalability_report.md`

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| SC-01 | 현재 아키텍처 확장성 리포트 작성 | ✅ | 유저 10/50/100명 시나리오 분석 |
| SC-02 | command_worker 동시 처리 한계 점검 | ✅ | Semaphore(2), 10명까지 가능, 50명+ 불가 |
| SC-03 | SQLite → PostgreSQL 전환 검토 | ✅ | 유저 30명까지 현재 구조 유지 가능 |
| SC-04 | Playwright 인스턴스 풀링 설계 | ✅ | 컨텍스트 분리/원격 브라우저 권고 |
| SC-05 | Supabase 무료 티어 한계 점검 | ✅ | Storage 6명, DB 16명, API 83명 한도 |
## E2E 테스트 결과 (2026-03-23, 노트북)

> 노트북 WSL 환경에서 전체 기능 검증. 집 PC 서버와 Supabase 공유.

| # | 테스트 항목 | 결과 | 상세 |
|---|------------|------|------|
| T-01 | Python 구문 검증 (76개 파일) | ✅ | 전체 통과 |
| T-02 | Next.js 빌드 | ✅ | 44페이지 정상 빌드, 타입 에러 0 |
| T-03 | API 서버 (FastAPI 8001) | ✅ | 8개 엔드포인트 정상, health OK |
| T-04 | Supabase 연동 (9항목) | ✅ | 봇 설정/댓글/이웃/실행이력/chat_id 모두 정상 |
| T-05 | 댓글 봇 run E2E | ✅ | 54명 수집→10명 방문→34개 댓글 생성, 에러 0 |
| T-06 | 댓글 승인/거부 | ✅ | 승인/거부 정상, 소유권 검증 차단 확인 |
| T-07 | 텔레그램 봇 기동 | ✅ | 멀티유저 폴링 정상 |
| T-08 | 웹 앱 페이지 (8개) | ✅ | 전부 200 응답 |
| T-09 | 웹 API route (9개) | ✅ | 전부 정상 (401=인증필요) |
| T-10 | 이웃 데이터 | ✅ | 이웃 19명, 신청 8건, 테마 3개 |
| T-11 | 쿠키 갱신 | ✅ | NID_AUT 포함 13개 쿠키 갱신, Supabase 동기화 완료 |

### 발견된 버그 및 수정

| # | 이슈 | 심각도 | 수정 |
|---|------|--------|------|
| BUG-01 | `_handle_approval` 소유권 미검증 (다른 사용자 댓글 승인 가능) | 중간 | ✅ 수정 (82bf514) |
| BUG-02 | `handle_visit_neighbors` 실패 알림 chat_id 미전달 | 중간 | ✅ 수정 (82bf514) |
| BUG-03 | 쿠키 저장 시 NID_AUT 유실 (context.cookies()에서 세션 쿠키 드롭) | 높음 | 수동 갱신으로 임시 해결. 근본 수정 필요 (COOKIE-FIX) |
| BUG-04 | `count_today_comments` 미사용 import (telegram_bot.py:626) | 낮음 | 미수정 (기능 영향 없음) |

## TG-REFACTOR: 텔레그램 봇 리팩토링 — ✅ 완료 (2026-03-22)

> 댓글봇+이웃관리+AI초안 통합, 멀티유저, 큐 명령, 완료 알림

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| TG-01 | supabase_client.py — chat_id 매핑 함수 3개 추가 | ✅ | `get_user_by_chat_id`, `register_chat_id`, `get_chat_id_for_user` |
| TG-02 | telegram_notifier.py — chat_id 파라미터 + 명령 결과/실패 알림 | ✅ | `notify_command_result`, `notify_command_failure` |
| TG-03 | command_worker.py — process_command()에 알림 호출 추가 | ✅ | 성공/실패 시 텔레그램 알림 |
| TG-04 | telegram_bot.py — 풀 리팩토링 (멀티유저+큐+이웃+/start) | ✅ | ALLOWED_CHAT_ID 제거, _resolve_user 기반 |
| TG-05 | start_services.sh — telegram_bot.py로 변경 | ✅ | |
| TG-06 | 스킬 파일 2개 작성 | ✅ | telegram-bot-deploy.md, telegram-bot-test.md |
| TG-DB | Supabase telegram_chat_id 컬럼 추가 + 관리자 매핑 | ✅ | PostgREST로 실행 완료 |
| TG-07 | stale 명령 자동 재시도 + 실패 시 재시도 버튼 | ✅ | running→pending 복구, retry_cmd 콜백 |

---

## 야간 자동 작업 — ✅ 완료 (2026-03-22)

> 7개 작업 일괄 처리. 브리핑: `docs/프로젝트/briefings/`

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| COMMENT-STATS | 댓글 분석 기간 필터 기본값 7일로 변경 | ✅ | 기존 구현 확인, 기본값만 14→7 수정 |
| NEIGHBOR-TOGGLE | 이웃 목록 접기/펼치기 토글 | ✅ | localStorage 상태 유지 + 애니메이션 |
| NEIGHBOR-RECOMMEND | 이웃 추천 엔진 구현 | ✅ | 교류 빈도+테마 매칭 기반 (`recommend_engine.py`) |
| NAV-LAYOUT | 글쓰기 드롭다운 메뉴 | ✅ | 슬라이드 다운 애니메이션 + 하위 5개 항목 |
| ADMIN-BOT-STATS | 관리자 유저별 봇 현황 | ✅ | API + 상태 뱃지(활성/에러/비활성) + 통계 |
| NEIGHBOR-연동 | 이웃 시스템 5개 항목 연동 | ✅ | orchestrator 교류기록/자동신청/동기화/테마분석 |
| SCALABILITY | 확장성 리포트 | ✅ | 유저 5명 안정, 10명 조건부, 50명+ 재설계 필요 |

---

## COMMENT-QUALITY: 댓글 고도화 — ✅ 완료 (2026-03-21)

> AI 댓글 품질 향상: 톤 다양화, 카테고리별 맞춤, 후처리 필터 적용.
> 요구사항: `docs/프로젝트/요구사항/댓글-고도화.md`

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| CQ-01 | 톤 랜덤화 (감탄/공감/정보감사 3종) | ✅ | ai_comment.py `_pick_tone()` |
| CQ-02 | 카테고리 감지 (8종) + 카테고리별 프롬프트 | ✅ | `_detect_category()` + `_CATEGORY_PROMPT_HINTS` |
| CQ-03 | 시작어 중복 방지 | ✅ | `_extract_starters()` + avoid_starters 파라미터 |
| CQ-04 | 길이 균일화 (최소 80자, 최대 300자) | ✅ | generate_comment 내 검증 |
| CQ-05 | 이모지 2개 제한 + ㅎㅎ/ㅋㅋ 정규화 + 마침표 통일 | ✅ | comment_post_processor.py (신규) |
| CQ-06 | 카테고리별 폴백 문구 (8종 × 20개) | ✅ | phrases.py 확장 |

## NEIGHBOR: 이웃 관리 시스템 — ✅ 완료 (2026-03-21)

> 서로이웃 관리 + 교류 추적 + 신청 자동화 + 이웃 발견/방문 + 테마 등록.
> 요구사항: `docs/프로젝트/요구사항/신규방문자-서로이웃.md`

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| NB-01 | DB 스키마 (neighbors, requests, interactions, recommendations) | ✅ | 00020 마이그레이션 실행 완료 |
| NB-02 | 봇 설정 확장 (auto_neighbor_request 등 3컬럼) | ✅ | 00021 마이그레이션 실행 완료 |
| NB-03 | 웹 UI (현황/교류/신청/추천 4탭) | ✅ | neighbor/page.tsx + 6 컴포넌트 + 훅 + API lib |
| NB-04 | API Routes (stats/list/requests/interactions/recommendations/themes) | ✅ | api/neighbor/* 6개 |
| NB-05 | Python 이웃 체커 | ✅ | src/neighbor/neighbor_checker.py |
| NB-06 | Python 이웃 신청 자동화 | ✅ | src/neighbor/neighbor_requester.py |
| NB-07 | Python 이웃 DB 동기화 | ✅ | src/neighbor/neighbor_sync.py |
| NB-08 | Python 교류 추적 | ✅ | src/neighbor/interaction_tracker.py |
| NB-09 | 워커 핸들러 (neighbor_request) | ✅ | command_worker.py |
| NB-10 | 네비게이션 + 관리자 API | ✅ | header.tsx + admin/users/[userId]/neighbors |
| NB-11 | 이웃 발견 (키워드/테마 검색) | ✅ | neighbor_discoverer.py + discover_neighbors 명령 |
| NB-12 | 이웃 방문 (미방문 이웃 자동 방문 + AI 댓글) | ✅ | neighbor_visitor.py + visit_neighbors 명령 |
| NB-13 | 블로그 테마 등록/수정 | ✅ | bot_settings.blog_themes JSONB + themes API + UI |
| NB-14 | 테마로 이웃 찾기 (원클릭) | ✅ | NeighborActions "테마로 이웃 찾기" 버튼 |
| NB-15 | DB 마이그레이션 실행 (00020~00022 + CHECK 갱신) | ✅ | Supabase SQL Editor 실행 완료 |

> **미연동 (향후)**:
> - 추천 알고리즘 (neighbor_recommendations 데이터 생성)
> - 댓글 작성 시 interaction 자동 기록
> - 이웃 상태 주기적 동기화
> - auto_neighbor_request 자동화 (답방 시 자동 신청)
> - 테마 자동 분석 (블로그 게시물 AI 분석 → 테마 추천)

## BOT-REFACTOR: 봇 페이지 리팩토링 — ✅ 완료 (2026-03-21)

> 봇 페이지를 컴포넌트/훅/lib으로 분리. 유지보수성 향상.

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| BR-01 | 컴포넌트 7개 분리 | ✅ | BotControlPanel, CommentApprovalPanel, BotSettingsPanel 등 |
| BR-02 | 커스텀 훅 3개 | ✅ | useBotStatus, useBotSettings, useCommentHistory |
| BR-03 | API/유틸 lib | ✅ | bot-api.ts (인터페이스 + 상수 + API 함수) |
| BR-04 | 메인 페이지 리와이어 | ✅ | bot/page.tsx |

## ADMIN-ENHANCE: 관리자 페이지 개선 — ✅ 완료 (2026-03-21)

> 시스템 통계 대시보드 + 사용자 상세 조회 모달.

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| AE-01 | 시스템 통계 카드 (사용자/댓글/이웃/주간 실행) | ✅ | SystemStatsCard.tsx + api/admin/stats |
| AE-02 | 사용자 상세 모달 (댓글/페르소나/이웃 3탭) | ✅ | UserDetailModal.tsx + api/admin/users/[userId]/* 3개 |

## BOT-API: 봇 API 확장 — ✅ 완료 (2026-03-21)

> 댓글 히스토리 페이지네이션, 봇 통계, 이웃 설정/커맨드 확장.

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| BA-01 | 댓글 히스토리 API (페이지네이션+필터+정렬) | ✅ | api/bot/comments/route.ts |
| BA-02 | 봇 통계 API (일별/주별 집계) | ✅ | api/bot/stats/route.ts |
| BA-03 | settings에 이웃 관련 필드 추가 | ✅ | api/bot/settings/route.ts |
| BA-04 | command에 neighbor_request 타입 추가 | ✅ | api/bot/command/route.ts |

---

## COMMENT-HIST: 댓글 내역 조회 + 개인 프롬프트 — ✅ 완료 (2026-03-17)

> 봇 페이지에 상태별 댓글 내역 조회 + 사용자별 댓글 스타일 프롬프트 커스텀 기능 추가.

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| CH-01 | DB 마이그레이션 (`bot_settings.comment_prompt`) | ✅ | 00019_add_comment_prompt.sql |
| CH-02 | API `pending/route.ts` — status=all, limit, order=desc 지원 | ✅ | 내역 조회용 |
| CH-03 | API `settings/route.ts` — comment_prompt allowedKeys 추가 | ✅ | — |
| CH-04 | Python `supabase_client.py` — comment_prompt 필드 전달 | ✅ | get_user_bot_config + get_bot_settings_sb + update |
| CH-05 | Python `ai_comment.py` — custom_prompt 파라미터 | ✅ | _build_system_prompt(custom_rules=) |
| CH-06 | Python `orchestrator.py` — comment_prompt 전달 | ✅ | generate_comments_batch(custom_prompt=) |
| CH-07 | 웹 UI — 댓글 내역 카드 (상태별 탭 필터) | ✅ | /bot 페이지 |
| CH-08 | 웹 UI — 프롬프트 textarea + 기본값 복원 | ✅ | 설정 카드 내 |
| CH-09 | REQUIREMENTS.md 갱신 | ✅ | 2-2절 |

## MULTI-USER: 댓글 봇 다중 사용자 전환 — ✅ 완료 (2026-03-15~17)

> 봇 실행부(Python)를 다중 사용자로 전환. 회원가입한 모든 사용자가 각자의 댓글 봇을 운영.
> 03-17 보완: 쿠키 만료 알림(`record_cookie_expiry`) + `has_cookies` 필드 + COOKIE-AUTO 연동

<details>
<summary>MU-01 ~ MU-12 전체 완료 (클릭해서 펼치기)</summary>

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| MU-01 | DB 마이그레이션 (`bot_settings.naver_blog_id`) | ✅ 완료 | 00017_add_naver_blog_id.sql |
| MU-02 | REQUIREMENTS.md 다중 사용자 요구사항 | ✅ 완료 | 2-D절 추가 |
| MU-03 | API 보안 — user_id 필터 추가 | ✅ 완료 | 4개 route 수정 |
| MU-04 | supabase_client.py 리팩토링 | ✅ 완료 | 전 함수 user_id 파라미터화 |
| MU-05 | database.py 유저별 DB 분리 | ✅ 완료 | _resolve_db_path |
| MU-06 | naver_login.py 쿠키 전용 로그인 | ✅ 완료 | ensure_login_cookie_only() |
| MU-07 | orchestrator.py 다중 사용자 | ✅ 완료 | run(user_id=) |
| MU-08 | command_worker.py 연결 | ✅ 완료 | handler(user_id=) + Semaphore(2) |
| MU-09 | main.py Cron 다중 사용자 | ✅ 완료 | --all-users |
| MU-10 | 웹 UI 블로그 ID 설정 | ✅ 완료 | /bot naver_blog_id 입력 |
| MU-11 | settings.py + time_guard.py 수정 | ✅ 완료 | get_db_path/get_cookies_path |
| MU-12 | CODE_MAP.md 반영 | ✅ 완료 | — |

</details>

## PUBLISH: 웹 네이버 발행 — ✅ 완료 (2026-03-16~17)

> Command Queue 패턴으로 웹에서 네이버 발행. 03-17 버그 수정 3건 (상태 복원, queue_id 검증, stale 정리).

<details>
<summary>PUB-01 ~ PUB-14 전체 완료 (클릭해서 펼치기)</summary>

| # | 작업 | 상태 |
|---|------|------|
| PUB-01 | REQUIREMENTS.md 전면 재작성 | ✅ |
| PUB-02 | /publish API user_id 선택적 지원 | ✅ |
| PUB-03 | command_worker publish 핸들러 | ✅ |
| PUB-04 | 웹 API bot/command에 publish 명령 추가 | ✅ |
| PUB-05 | write/page.tsx 발행 버튼 + 폴링 | ✅ |
| PUB-06 | 발행 완료 알림 (웹 UI + 텔레그램) | ✅ |
| PUB-07 | SQL 마이그레이션 실행 (00018) | ✅ |
| PUB-09 | 댓글 프롬프트 개선 | ✅ |
| PUB-10 | 웹 댓글 수정 기능 | ✅ |
| PUB-11 | dev→master 머지 + Production 배포 | ✅ |
| PUB-12 | 예외 시 상태 "completed"→"failed" 버그 수정 | ✅ (P0) |
| PUB-13 | queue_id 유효성 검증 추가 | ✅ |
| PUB-14 | 워커 재시작 시 stale 명령 정리 | ✅ |

</details>

## COOKIE-AUTO: 쿠키→블로그 ID 자동 추출 — ✅ 완료 (2026-03-17)

> 쿠키 업로드 → bot_commands(extract_blog_id) → command_worker → Playwright → bot_settings UPDATE

<details>
<summary>CA-01 ~ CA-04 전체 완료 (클릭해서 펼치기)</summary>

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| CA-01 | extract_blog_id() 함수 | ✅ | MyBlog.naver 리다이렉트 + 네이버 메인 폴백 |
| CA-02 | cookies/route.ts POST 후 자동 트리거 | ✅ | 중복 방지 |
| CA-03 | 웹 UI "✓ 자동 감지" 라벨 | ✅ | 15초 후 settings 재로딩 |
| CA-04 | command_worker 핸들러 | ✅ | handle_extract_blog_id() |

</details>

---

## TEST: 기능별 통합 테스트 (2026-03-12)

> 전 기능 실동작 검증. 1단계(코드 검증)는 클로드 단독, 2단계(실행 테스트)는 같이 진행.

### 1단계: 코드 건강 점검 (클로드 단독)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| T-00a | Python 전체 구문 검증 (py_compile) | ✅ 통과 | 68파일 전체 성공 |
| T-00b | Next.js 빌드 (`npm run build`) | ✅ 통과 | 전 라우트 빌드 성공 (21 API + 12 페이지) |
| T-00c | 환경변수 누락 체크 (.env, .env.local) | ✅ 통과 | 로컬 봇 10개 + 웹 6개 전부 존재 |

### 2단계: 웹 플랫폼 (같이 — 브라우저 필요)

| # | 항목 | 테스트 방법 | 상태 |
|---|------|-----------|------|
| T-01 | 로그인/회원가입 | insungblog.vercel.app 접속 → 로그인 | 대기 |
| T-02 | AI 글쓰기 | 사진 업로드 → 메모 → 생성 → 초안 확인 | 대기 |
| T-03 | 재생성 | 피드백 입력 → 재생성 → 수정 반영 확인 | 대기 |
| T-04 | 글 저장/복사/삭제 | 저장 → 대시보드 확인 → 삭제 | 대기 |
| T-05 | 페르소나 | /persona → 크롤링 → 분석 → 항목 확인 | 대기 |
| T-06 | 콘텐츠 캘린더 | /calendar → 일정 추가 → 글쓰기 연동 | 대기 |
| T-07 | 성과 분석 | /analytics → URL 추가 → 크롤링 → 차트 | 대기 |
| T-08 | 관리자 페이지 | /admin → 사용자 목록 → 티어 변경 | 대기 |

### 3단계: 댓글 봇 (같이 — 로컬 실행)

| # | 항목 | 테스트 방법 | 상태 |
|---|------|-----------|------|
| T-10 | 봇 dry-run | `python main.py --run-once --dry-run` → 로그 확인 | 대기 |
| T-11 | 웹 봇 제어 | /bot → 상태 카드 + 설정 변경 + 승인/거부 | 대기 |
| T-12 | 텔레그램 봇 제어 | /pending → /execute → 결과 확인 | 대기 |
| T-13 | Command Queue | 웹 "실행" 버튼 → 워커 실행 → 결과 표시 | 대기 |
| T-14 | 쿠키 동기화 | 웹 쿠키 업로드 → 봇에서 읽히는지 확인 | 대기 |

### 4단계: 텔레그램 글쓰기 (같이)

| # | 항목 | 테스트 방법 | 상태 |
|---|------|-----------|------|
| T-20 | 텔레그램 글 생성 | 사진 전송 → AI 초안 → HTML 프리뷰 수신 | 대기 |
| T-21 | 대시보드 연동 | 텔레그램 생성 글이 웹 대시보드에 TG 뱃지로 표시되는지 | 대기 |

---

## 완료된 마일스톤

| # | 작업 | 중요도 | 완료일 |
|---|------|--------|--------|
| SCALABILITY | 확장성 점검 리포트 (5명 안정, 10명 조건부, 50명+ 재설계) | P1 | 03-23 |
| NEIGHBOR-연동 | 이웃 시스템 미연동 5개 항목 연동 (교류기록/자동신청/동기화/테마분석) | P2 | 03-23 |
| ADMIN-BOT-STATS | 관리자 유저별 봇 사용현황 (상태 뱃지 + 통계) | P1 | 03-23 |
| NAV-LAYOUT | 네비 글쓰기 드롭다운 + 슬라이드 다운 UX | P1 | 03-23 |
| NEIGHBOR-RECOMMEND | 이웃추천 엔진 신규 (교류 빈도+테마 점수) | P1 | 03-23 |
| NEIGHBOR-TOGGLE | 이웃 목록 접기/펼치기 토글 + localStorage | P1 | 03-23 |
| COMMENT-STATS | 댓글 분석 기간 필터 기본값 7일 수정 | P1 | 03-23 |
| TG-REFACTOR | 텔레그램 봇 리팩토링 (멀티유저+큐+이웃+알림) | P0 | 03-22 |
| TG-MIGRATE | Supabase telegram_chat_id 컬럼 추가 + 관리자 매핑 | P0 | 03-22 |
| ADMIN-E2E | 관리자 계정 댓글/이웃 실동작 검증 (21/22 성공) | P0 | 03-22 |
| NEIGHBOR | 이웃 관리 시스템 (DB 4테이블 + 웹 UI 6컴포넌트 + API 6개 + Python 6모듈 + 워커 핸들러 3개 + 테마 등록) | P1 | 03-21 |
| COMMENT-QUALITY | 댓글 고도화 (톤 랜덤화 + 카테고리 감지 + 시작어 중복 방지 + 후처리 필터) | P1 | 03-21 |
| BOT-REFACTOR | 봇 페이지 리팩토링 (컴포넌트 7 + 훅 3 + API lib 분리) | P2 | 03-21 |
| ADMIN-ENHANCE | 관리자 페이지 개선 (시스템 통계 + 사용자 상세 모달 + API 4개) | P2 | 03-21 |
| BOT-API | 봇 API 확장 (댓글 히스토리 + 통계 + 이웃 설정/커맨드) | P1 | 03-21 |
| COMMENT-HIST | 댓글 내역 조회 + 개인 댓글 프롬프트 편집 | P1 | 03-17 |
| COOKIE-AUTO | 쿠키 업로드 시 블로그 ID 자동 추출 (Command Queue 재활용) | P1 | 03-17 |
| PUBLISH-FIX | 발행 버그 수정 3건 (상태 복원·queue_id 검증·stale 정리) | P0 | 03-17 |
| MULTI-USER-보완 | 쿠키 만료 알림 + has_cookies 필드 + extract_blog_id 연동 | P1 | 03-17 |
| COMMENT-UX | 댓글 프롬프트 개선 + 웹 수정 기능 | P1 | 03-16 |
| VERCEL-PROD | dev→master 머지 Production 배포 | P0 | 03-16 |
| PUBLISH | 웹 네이버 발행 기능 (Command Queue + Playwright) | P0 | 03-16 |
| MULTI-USER | 댓글 봇 다중 사용자 전환 (12건) | P1 | 03-15 |
| W7 | 웹 봇 제어 + 쿠키 양방향 동기화 (Command Queue 패턴) | P1 | 03-09 |
| W6 | 댓글 봇 웹 통합 — 텔레그램+웹 이중 제어 | P1 | 03-08 |
| W5 | 페르소나 학습 파이프라인 | P1 | 03-08 |
| W4-05 | 3티어 사용량 제한 시스템 | P1 | 03-07 |
| W4-03 | 실사용 테스트 + 버그 수정 (코드리뷰 7건) | P2 | 03-08 |
| LOC-01 | 로컬 봇 Phase 2+3 완성 | P2 | 03-09 |

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
| API 서버 | ✅ 실행 중 | tmux blog:api, 포트 8001 (03-10 확인) |
| 웹 대시보드 (/bot) | ✅ 완료 | 상태·승인·설정 통합 UI |
| Next.js 웹앱 | ✅ 실행 중 | localhost:3002 (03-10 시작, 3000/3001 사용 중) |

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

### W7-BUG: 워커 중복 실행 방지 — ✅ 완료

> ojh919 블로그에 댓글 2중 게시 발생 → 원인: 워커 다중 실행 + race condition

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| BUG-01 | pidfile 잠금 (`fcntl.flock`) | ✅ 완료 | `data/worker.lock`, 프로세스 종료 시 자동 해제 (03-10) |
| BUG-02 | atomic claim (`claim_command()`) | ✅ 완료 | `.eq("status", "pending")` 조건부 UPDATE (03-10) |
| BUG-03 | `start_services.sh` 안전장치 | ✅ 완료 | 워커 시작 전 `pkill -f "command_worker.py"` (03-10) |

**방어 레이어 3중:**
1. `start_services.sh` → 서비스 재시작 시 기존 워커 종료
2. `_acquire_lock()` → 프로세스 수준 중복 실행 차단
3. `claim_command()` → DB 수준 atomic claim으로 race condition 제거

### 네이버 댓글 조회 방식 확인 (03-10~11)

> 외부 블로그 댓글 읽기 — API vs Playwright 비교 테스트

**결론: 모바일 Playwright만 동작**

| 방식 | 결과 | 비고 |
|------|------|------|
| cbox3 API (`web_naver_list_jsonp.json`) | ❌ 404/라우팅 에러 | cbox9로 전환되어 폐기됨 |
| cbox9 API | ❌ "API does not exist" | 엔드포인트명 변경, 인증 필요 추정 |
| command.blog.naver.com | ❌ 404 | |
| CommentListAsync.naver | ❌ 404 | |
| m.blog.naver.com getAllComments | ❌ 로그인 리다이렉트 | |
| 데스크톱 Playwright (PostView iframe) | ❌ cbox JS 미로드 | iframe 19개, 댓글 영역 빈 상태 |
| **모바일 Playwright** | ✅ 성공 | `a._commentCount` 클릭 → `u_cbox_comment_box` 추출 |

**모바일 Playwright 댓글 조회 패턴 (03-11 셀렉터 업데이트):**
```
1. m.blog.naver.com/{blogId}/{logNo} 접근 (모바일 UA)
2. [class*="comment_btn"] 클릭 (댓글 영역 lazy-load 트리거)
   ※ 기존 a._commentCount는 폐기됨 — CSS 모듈 해시 클래스로 변경
3. 5초 대기
4. .u_cbox_comment_box 셀렉터로 댓글 추출
5. a.u_cbox_name → href의 blogId= 파라미터로 블로그 ID 추출
```

- youyoubear0517 테스트: 최신글 3개 댓글 정상 추출 (29/14/40개)
- letter_hih (우리 블로그): 댓글 0개 확인

### 댓글 수집 모바일 전환 — ✅ 완료 (03-11)

> `comment_collector.py` + `post_collector.py` 수정 — 데스크톱 cbox JS 미로드 근본 해결

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| MOB-01 | `_collect_from_posts_fallback()` 모바일 Playwright 전환 | ✅ 완료 | 모바일 컨텍스트 생성 → 댓글 버튼 클릭 → blogId 추출 |
| MOB-02 | `_extract_log_nos_from_html()` 폴백 추가 | ✅ 완료 | SPA/피드 형태 블로그 대응 (mainFrame 없는 경우) |
| MOB-03 | `settings.py` 모바일 상수 | ✅ 완료 | MOBILE_UA, MOBILE_VIEWPORT, COMMENT_LOAD_WAIT |
| MOB-04 | URL 중복 수집 방지 | ✅ 완료 | `seen_urls` 세트로 동일 게시물 재방문 차단 |

**검증 결과:** youyoubear0517 → 66명 댓글 작성자 정상 추출

**핵심 변경점:**
- 댓글 버튼 셀렉터: `a._commentCount` → `[class*="comment_btn"]`
- 블로그 ID 추출: `a.u_cbox_name` href → `blogId=` 쿼리 파라미터
- 게시물 목록: mainFrame iframe 없는 새 형식 → HTML 소스 logNo 정규식 폴백

### Vercel 배포 — ✅ 완료 (03-11)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| DEPLOY-01 | Vercel 프로덕션 배포 | ✅ 완료 | insungblog.vercel.app |
| DEPLOY-02 | 환경변수 6개 등록 | ✅ 완료 | NEXTAUTH_URL=insungblog.vercel.app |
| DEPLOY-03 | Supabase Auth redirect URL 등록 | 수동 필요 | `insungblog.vercel.app/**` 추가 |

*마지막 업데이트: 2026-03-21 (NEIGHBOR 이웃 발견/방문/테마 추가)*

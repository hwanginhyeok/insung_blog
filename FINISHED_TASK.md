# Finished Tasks

> 2026년 4월 완료 태스크

| # | 태스크 | 완료일 | 비고 |
|---|--------|--------|------|
| PERSONA-EXAMPLE | 예시 페르소나 시스템 (카테고리별 기본 제공) | 04-11 | DB+API+시딩+UI 1차 구현 후 PERSONA-TIER-SPLIT에 흡수. lazy loading은 TIER-SPLIT Phase 2에서 처리됨 |
| ADMIN-USAGE-DETAIL | 관리페이지 사용자 이용 내역 상세 (Phase 1) | 04-11 | UserDetailModal "사용 통계"/"결제 이력" 탭 + /admin 상단 시스템 활동/매출 카드. heatmap(7x24 KST) + 24h bar + 30일 line + 월비교 + 12개월 매출. 신규 API 4개(usage/payments/stats.activity/stats.revenue). 마이그레이션 0개 |
| TELEGRAM-SIMPLIFY | 텔레그램봇 단방향 관리자 알림 전용 전환 | 04-11 | telegram_bot*.py 삭제(-1001줄), notifier 리팩터(관리자 redirect + user prefix), daily_admin_report.py(10명+ 조건), FastAPI 5xx 핸들러(5분 throttle), Next.js 가입/결제/포트원 알림 훅. cron 등록 사용자 직접 |
| VISITOR-TRACK-UI | 방문자수 웹 대시보드 — Chart.js 추이 그래프 | 04-09 | GET /api/visitor/stats + /analytics/visitor 페이지. Recharts 라인 차트 |
| MIGRATION-UNIQUE | pending_comments UNIQUE partial index 적용 | 04-03 | supabase db push 적용 + 중복 삽입 차단 검증 완료 |
| MIGRATION-AUTO-MODE | bot_settings에 daily_discover/auto_execute 컬럼 추가 | 04-03 | supabase db push로 적용 + 컬럼 존재 검증 완료 |
| UX-H02 | 로그인 후 기본 화면 = /write | 04-03 | 신규 → /write, 재방문 → /calendar |
| UX-H05 | 비밀번호 찾기 기능 추가 | 04-03 | /reset-password 페이지 구현 |
| UX-M01 | 삭제 confirm → AlertDialog | 04-03 | ConfirmDialog 컴포넌트 3곳 적용 |
| UX-M03 | 모바일 스탯 카드 표시 | 04-04 | CTA 하단 인라인 배지 3개 추가 |
| UX-M04 | 이웃관리 "새 이웃 찾기" disabled 안내 개선 | 04-04 | 테마 미등록 시 안내 문구 추가 |
| ADMIN-BOT-DETAIL | UserDetailModal에 봇 실행 이력 탭 추가 | 04-04 | 요약 카드 4개 + 상태 뱃지 + 최근 실행 로그 |
| PERSONA-SPLIT | 페르소나 용도별 3분할 (글쓰기/댓글/대댓글) | 04-05 | persona_builder 용도별 빌드 + 닉네임 필터 |
| BUG-REPORT | 버그/오류 리포팅 프로세스 구축 | 04-05 | FeedbackPanel + support_tickets + 텔레그램 알림 |
| OLLAMA-PARALLEL | Ollama 병렬 댓글 생성 | 04-05 | ThreadPoolExecutor 3병렬. 25개/분→33개/분 |
| COOKIE-ONBOARD | 쿠키 미등록 온보딩 배너 | 04-05 | 봇 페이지 상단 노란 배너 + 스크롤 링크 |
| DESIGN-REVIEW-2 | 홈페이지 전체 디자인 리뷰 + 모바일 UX | 04-05 | 15건 수정 + Pretendard + 애니메이션. B-→B+ |
| STABILITY-FIX | 서버 안정성 버그 5건 수정 | 04-05 | Elastic Semaphore, Task 루프, API 오프로드, 세마포어 개선 |
| NEIGHBOR-IMPROVE | 이웃봇 10건 이슈 일괄 개선 | 04-05 | DB 한도/추천 감쇠/셀렉터 폴백/쿠키 감지/RLS/UI/테스트 |
| SCALING-DETAIL | 동시 접속자 기준 스케일링 정밀 분석 | 04-07 | 5단계 7개 분석 항목, ASCII 아키텍처 다이어그램 |
| PREVIEW-MARKER-FIX | 글 프리뷰 마커 파싱 렌더러 동기화 | 04-07 | \n\n 분할 → \n\n+ 문단 + \n 라인 분할로 통일 |
| WORKER-ELASTIC | 워커 슬롯 탄력 분배 (Elastic Semaphore) | 04-05 | acquire/release_user_slot + 세마포어 구조 개선 |
| COMMENT-REVOKE | 승인 취소 기능 (approved → pending) | 04-06 | API + UI + DB 검증 완료 |
| AUTO-REPLY | 대댓글 자동 답글 | 04-06 | 마이그레이션 적용 + posted 1건 동작 확인 |
| PERSONA-UI | 페르소나 UI 3그룹 + 크롤러 블록 상세화 + 레이아웃 패턴 | 04-06 | 렌더러 마커 + regeneratePost + 다중열림 |
| EXECUTE-PARALLEL | 댓글 게시 병렬화 (동시 3개) | 04-06 | asyncio.gather + Semaphore(3) |
| VISIT-PARALLEL | 이웃 방문 병렬화 (동시 3명) | 04-06 | 13분→8분 (35% 단축) |
| PERSONA-RLS | 페르소나 RLS + 예시 테이블 생성 | 04-06 | user_personas/persona_items/persona_feedback RLS |
| GEN-QUEUE-FIX | generation_queue CHECK 제약 수정 | 04-06 | publishing/saving/save_failed 추가 |
| TIER-SYNC | Pro 한도 동기화 (400/200/200) | 04-06 | tier.ts + supabase_client.py + settings.py + pricing |
| VISITOR-TRACK | 블로그 방문자수 수집 시스템 | 04-08 | 수집 스크립트 + DB 마이그레이션 + 자정 초기화 실측확인 |
| NOTIFY-KAKAO | 다중 채널 알림 라우터 | 04-08 | NotificationRouter (텔레그램/FCM/카카오) 추상화. 실 연동은 설정 후 |
| BOT-PROGRESS | 댓글 게시 진행률 API | 04-08 | GET /comment/progress/{command_id} + execute 응답에 command_id 포함 |
| NEIGHBOR-E2E | 이웃 연동 E2E 로직 테스트 | 04-08 | 18건 테스트 (sync/discoverer/feed/imports). 브라우저 E2E는 TODO |

# Finished Tasks

> 2026년 4월 완료 태스크

| # | 태스크 | 완료일 | 비고 |
|---|--------|--------|------|
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

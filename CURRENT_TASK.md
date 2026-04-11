# Current Tasks

| # | 태스크 | 시작일 | blocked | 비고 |
|---|--------|--------|---------|------|
| PERSONA-EXAMPLE | 예시 페르소나 시스템 (카테고리별 기본 제공) | 2026-04-07 | — | DB+API+시딩+UI 구현 완료. dev 검증 후 push 필요 |
| VISITOR-TAB-LOC | 방문자수 추이 탭 위치 결정 | 2026-04-10 | — | profile 페이지(마이페이지)에 통합 결정 |
| COLLECT-PARALLEL | 블로그 수집 병렬화 설계 | 2026-04-10 | — | 방문/게시 이미 병렬화됨. comment_collector 폴백 경로 최적화 |
| TELEGRAM-SIMPLIFY | 텔레그램봇 단방향 관리자 알림 전용 전환 | 2026-04-11 | — | 양방향 봇 제거(telegram_bot.py 삭제) + blog-telegram 서비스 중지 + notifier를 관리자 채팅 전용으로 리팩터 + 일일 통계(유저 10명+ 조건) + 버그 알림(support_tickets / 5xx) |
| ADMIN-USAGE-DETAIL | 관리페이지 사용자 이용 내역 상세 기능 (Phase 1) | 2026-04-11 | — | UserDetailModal에 "사용 통계"+"결제 이력" 탭 추가. 시간대 heatmap + 24h bar + 일별 30d + 월별 카드. /admin 상단 시스템 활동/매출 차트. 기존 테이블만 사용(마이그레이션 0개). Phase 2(로그인/에러/API)는 별도 |

# Current Tasks

| # | 태스크 | 시작일 | blocked | 비고 |
|---|--------|--------|---------|------|
| PERSONA-TIER-SPLIT | 페르소나 티어 분리 + 용도별 3분할 | 2026-04-11 | — | Phase 1 진행 중. 플랜: [plans/persona-tier-split.md](docs/프로젝트/plans/persona-tier-split.md) |
| PERSONA-EXAMPLE | 예시 페르소나 시스템 (카테고리별 기본 제공) | 2026-04-07 | TIER-SPLIT에 흡수 | DB+API+시딩+UI 구현 완료. 탭 lazy loading은 TIER-SPLIT Phase 2에서 처리 |
| VISITOR-TAB-LOC | 방문자수 추이 탭 위치 결정 | 2026-04-10 | — | profile 페이지(마이페이지)에 통합 결정 |
| COLLECT-PARALLEL | 블로그 수집 병렬화 설계 | 2026-04-10 | — | 방문/게시 이미 병렬화됨. comment_collector 폴백 경로 최적화 |
| ADMIN-USAGE-DETAIL | 관리페이지 사용자 이용 내역 상세 기능 (Phase 1) | 2026-04-11 | — | UserDetailModal에 "사용 통계"+"결제 이력" 탭 추가. 시간대 heatmap + 24h bar + 일별 30d + 월별 카드. /admin 상단 시스템 활동/매출 차트. 기존 테이블만 사용(마이그레이션 0개). Phase 2(로그인/에러/API)는 별도 |

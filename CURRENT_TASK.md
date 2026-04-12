# Current Tasks

| # | 태스크 | 시작일 | blocked | 비고 |
|---|--------|--------|---------|------|
| PERSONA-TIER-SPLIT | 페르소나 티어 분리 + 용도별 3분할 | 2026-04-11 | Phase 3 UI 대기 (집에서 dev 검증 후 진행) | **Phase 1+2 백엔드 완료** (4커밋, dev 적용+시딩+검증 OK). 다음: list API 그룹핑(9개로 보이는 문제) → /persona/page.tsx(872줄) 활성 카드+lazy → /bot 셀렉터 → /write 셀렉터 → 상세 모달 [편집/미리보기] 2탭. 플랜: [plans/persona-tier-split.md](docs/프로젝트/plans/persona-tier-split.md). 후속: PERSONA-DOWNGRADE/PERSONA-PREVIEW-LIVE는 PREPARED |
| VISITOR-TAB-LOC | 방문자수 추이 탭 위치 결정 | 2026-04-10 | — | profile 페이지(마이페이지)에 통합 결정 |
| COLLECT-PARALLEL | 블로그 수집 병렬화 설계 | 2026-04-10 | — | 방문/게시 이미 병렬화됨. comment_collector 폴백 경로 최적화 |
| BOT-FLOW-REVIEW | 이웃봇·댓글봇 플로우 점검 + UX/UI 검토 | 2026-04-12 | — | 이웃봇(발견→방문→이웃신청)과 댓글봇(수집→생성→승인→게시) 전체 플로우 점검. UX/UI 관점에서 /bot 페이지 + 관련 모달/상태 리뷰 |

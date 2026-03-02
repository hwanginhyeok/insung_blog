# TASK — 작업 현황

> 실시간 갱신. 작업 착수/완료/발견 시 즉시 반영.

---

## 현재 진행 중

| # | 작업 | 중요도 | 상태 | 비고 |
|---|------|--------|------|------|
| P3-5 | 워크플로 Active 전환 + 통합 테스트 | P1 | 진행 | FastAPI 서버 실행 → 텔레그램 /status 테스트 |

---

## 작업 현황

| # | 작업 | 중요도 | 상태 | 비고 |
|---|------|--------|------|------|
| P2-1 | debug_publisher.py로 에디터 셀렉터 확인 | P1 | 예정 | Phase 2 첫 테스트 |
| P2-2 | content_generator 단독 테스트 (API 키 필요) | P1 | 예정 | API 키 등록 완료, 테스트 미실시 |
| P2-3 | publisher dry-run 전체 파이프라인 | P1 | 예정 | P2-1, P2-2 완료 후 |
| P2-4 | 실제 발행 테스트 → 게시물 URL 확인 | P2 | 예정 | P2-3 완료 후 |

---

## 완료

| # | 작업 | 완료일 | 비고 |
|---|------|--------|------|
| Phase1 | 댓글 봇 기본 기능 (수집/작성/DB/스케줄) | 2026-03-01 | main.py + orchestrator |
| Phase1 | AI 댓글 생성 (Haiku + phrases 폴백) | 2026-03-01 | ai_comment.py |
| Phase1 | API 키 발급 + .env 등록 | 2026-03-02 | ANTHROPIC_API_KEY 연결 성공 |
| Phase1 | settings.py 시간대 20~24시 + 스케줄 20:30 | 2026-03-02 | |
| Phase1 | comment_writer.py AI 통합 + 본문 추출 | 2026-03-02 | pick_phrase → generate_comment |
| Phase2 | 게시물 발행 시스템 코드 구현 | 2026-03-02 | content_generator + blog_publisher + DB 확장 |
| Phase3 | api_server.py FastAPI 웹훅 서버 | 2026-03-02 | 6개 엔드포인트 |
| Phase3 | 텔레그램 봇 생성 + .env 등록 | 2026-03-02 | @HIH_Blog_bot, Chat ID 8338946226 |
| Phase3 | n8n 설치 (v2.9.4) + 실행 | 2026-03-02 | localhost:5678 |
| Phase3 | n8n 워크플로 import + credential 설정 | 2026-03-02 | blog_post_flow + comment_bot_flow |
| Phase4 | skill_manager.py 피드백 루프 | 2026-03-02 | /feedback 엔드포인트 포함 |
| Infra | CLAUDE.md + TASK.md + coding-rules.md | 2026-03-02 | 코드 관리 체계 구축 |
| Infra | workflow-rules.md + REVIEW_LOG + CODE_MAP | 2026-03-02 | 코드리뷰 + 코드 지도 |
| INF-1 | Phase 3/4 코드리뷰 | 2026-03-02 | Major 4건 수정 (브라우저 중복, 미사용 import, 에러 노출, 하드코딩 필터) |
| INF-2 | CODE_MAP 갱신 (Phase 3/4 반영) | 2026-03-02 | api_server, skill_manager, n8n/ 추가 |

---

## TODO (향후 검토)

- [ ] 네이버 2FA/캡차 대응 전략
- [ ] 이미지 리사이즈/최적화 (업로드 전)
- [ ] 게시물 카테고리 자동 선택
- [ ] 발행 후 댓글 봇과 연동 (자기 글에 온 댓글 답변)
- [ ] Phase 5: 협찬/광고 관리 시스템
- [ ] Phase 5: 블로그 성과 분석 (조회수, 유입 키워드)
- [ ] Phase 5: 다계정 운영 지원
- [ ] Phase 5: 콘텐츠 캘린더 (주제 추천 + 발행 스케줄)

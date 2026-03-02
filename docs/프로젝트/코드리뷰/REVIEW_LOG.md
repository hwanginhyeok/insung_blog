# REVIEW_LOG — 코드리뷰 기록

> 최신순 기록. 새 항목을 위에 추가.

---

## 2026-03-02 — Phase 3/4 코드리뷰 (api_server + skill_manager)

- **TASK**: INF-1
- **변경 파일**: api_server.py, src/ai/skill_manager.py, .env.example
- **이슈 요약**: Critical 0 / Major 4 / Minor 5
- **조치**:
  - Major #1: `/publish` 브라우저 설정 인라인 → `create_browser()` 호출로 교체
  - Major #2: 미사용 import `PAGE_LOAD_TIMEOUT` 제거
  - Major #3: HTTPException에 예외 원문 노출 → 사용자 친화 메시지로 교체 (상세는 logger에만)
  - Major #4: `_count_feedback_rows()`의 `"첫 게시물"` 하드코딩 → 날짜 패턴(`YYYY-MM-DD`) 매칭으로 변경
  - Minor #6: `HASHTAG_AI_MODEL` 재사용 의도 주석 추가
  - Minor #9: .env.example 텔레그램 토큰 주석 해제
  - Minor #5(인증), #7(임시파일), #8(에러 노드): 별도 Task로 분리 (P3-7 등)
- **판정**: 전건 수정 완료, 머지 가능

---

## 2026-03-02 — Phase 2 코드리뷰 + 리팩토링

- **TASK**: P2 리뷰
- **변경 파일**: content_generator.py, publisher_main.py, blog_publisher.py, debug_publisher.py, orchestrator.py, src/utils/browser.py(신규)
- **이슈 요약**: Critical 0 / Major 3 / Minor 2
- **조치**:
  - Major #1: `import json` 함수 내부 → 모듈 상단으로 이동 (content_generator.py)
  - Major #2: 미사용 import `PAGE_LOAD_TIMEOUT` 제거 (publisher_main.py)
  - Major #3: 브라우저 설정 3곳 중복 → `src/utils/browser.py` 공통 유틸 추출 (publisher_main, debug_publisher, orchestrator)
  - Minor #1: `_find_by_text` return type `object` → `ElementHandle` (blog_publisher.py)
  - Minor #2: 미사용 import `json` 제거 (debug_publisher.py)
- **판정**: 전건 수정 완료, 머지 가능

---

## 2026-03-02 — Phase 2 게시물 발행 시스템 구현

- **TASK**: P2 전체 (settings.py 수정 + 6개 신규 파일)
- **변경 파일**: config/settings.py, debug_publisher.py, src/ai/content_generator.py, src/publisher/blog_publisher.py, src/storage/database.py, publisher_main.py
- **이슈 요약**: Critical 0 / Major 0 / Minor 0
- **조치**: 초기 구현, 구문 검증 통과. 실제 네이버 테스트 전이라 셀렉터 정확도 미확인
- **판정**: 머지 가능 (dry-run 테스트 선행 필요)
- **비고**: 셀렉터는 debug_publisher.py 실행 후 업데이트 예정

---

## 2026-03-02 — 코드 관리 체계 구축

- **TASK**: Infra (CLAUDE.md, TASK.md, coding-rules.md, workflow-rules.md, CODE_MAP.md)
- **변경 파일**: CLAUDE.md, docs/프로젝트/ 하위 5개 파일
- **이슈 요약**: Critical 0 / Major 0 / Minor 0
- **조치**: 이슈 없음 (문서 파일)
- **판정**: 머지 가능

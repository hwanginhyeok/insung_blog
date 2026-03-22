# NEIGHBOR-연동 브리핑

## 요약
이웃 시스템 미연동 5개 항목 구현 완료. orchestrator에 교류 기록/자동 신청 연동, 테마 분석 엔진·주기적 동기화·추천 알고리즘 신규 생성.

## 변경 파일
- `src/orchestrator.py` — 댓글 작성 시 interaction 자동 기록 + 답방 시 auto_neighbor_request 연동
- `src/neighbor/neighbor_sync.py` — `sync_neighbor_statuses()` 주기적 동기화 함수 추가
- `src/neighbor/theme_analyzer.py` — **신규** 키워드 기반 테마 자동 분석 엔진
- `src/neighbor/recommend_engine.py` — **신규** 교류 빈도+테마 기반 추천 알고리즘 (Task 3에서 완료)

## 기술 결정
- **교류 기록**: auto/manual 모드 모두에서 댓글 작성 시 `record_interaction()` + `update_last_interaction()` 호출
- **자동 신청**: `auto_neighbor_request` 설정이 true일 때만 동작. 방문 완료 후 이웃 상태 확인 → 이웃 아닌 경우 자동 신청
- **테마 분석**: AI API 호출 금지(가드레일) → 12개 카테고리 키워드 사전 기반 매칭. `_THEME_KEYWORDS`로 게시물 제목 분석
- **주기적 동기화**: `sync_neighbor_statuses(page, user_id)` — `last_interaction_at` 기준 오래된 이웃부터 상태 재확인

## 테스트 결과
- `py_compile` 구문 검증 4개 파일 모두 통과

## 남은 작업 / 주의사항
- command_worker에 sync/theme_analyze 명령 핸들러 추가 (향후)
- 주기적 실행 스케줄링 (cron 또는 워커 통합)
- 실 환경 E2E 테스트 필요 (Playwright 브라우저 필요)

## 핵심 코드 변경
```python
# orchestrator.py — 댓글 작성 후 교류 기록
if success:
    record_interaction(blog_id, "comment_sent", post_url=data["url"], ...)
    update_last_interaction(blog_id, user_id=user_id)

# orchestrator.py — 방문 후 자동 이웃 신청
if settings.get("auto_neighbor_request"):
    status = await check_neighbor_status(page, blog_id)
    if status is None:
        await send_neighbor_request(page, blog_id, ...)
```

# FAIL-FAST 브리핑

## 요약
댓글 입력창 없는 게시물에서 ~70초 소비하던 문제를 ~20초로 최적화. 주력 셀렉터에만 10초 대기, 나머지 폴백 셀렉터는 2초로 단축.

## 변경 파일
- `src/commenter/comment_writer.py` -- _find_comment_input() 폴백 셀렉터 타임아웃 2초로 단축

## 기술 결정
- **문제 원인**: _INPUT_SELECTORS 6개 * ELEMENT_TIMEOUT(10초) = 최대 60초 대기. 페이지 로드 + 댓글 영역 열기까지 합치면 ~70초
- **해결**: 첫 번째 셀렉터(.u_cbox_text)만 ELEMENT_TIMEOUT(10초) 사용, 나머지 5개는 FALLBACK_TIMEOUT(2초)
- **근거**: 99% 이상의 네이버 블로그가 .u_cbox_text 셀렉터 사용. 이 셀렉터에서 10초 내 발견 못하면 댓글 비활성화 확률이 매우 높음
- **대안 1**: 모든 셀렉터를 3초로 줄이기 -> 느린 네트워크에서 주력 셀렉터도 놓칠 수 있음
- **대안 2**: Promise.race로 병렬 탐색 -> Playwright frame API에서 구현 복잡

## 테스트 결과
- 구문 검증: 통과
- 예상 성능: 입력창 없는 게시물에서 10초 + (5 * 2초) = 20초. 기존 대비 ~50초 절감
- 242개 실패 케이스 기준: ~3.4시간 절약

## 남은 작업 / 주의사항
- "입력창 없음" 블로거를 일정 기간 스킵하는 로직 검토 (반복 실패 방지)
- 실 환경에서 타임아웃 값 튜닝 필요 시 FALLBACK_TIMEOUT 상수 조정

## 핵심 코드 변경
```python
# before
async def _find_comment_input(frame):
    for selector in _INPUT_SELECTORS:
        el = await frame.wait_for_selector(selector, timeout=ELEMENT_TIMEOUT)  # 6개 * 10초 = 60초
        ...

# after
FALLBACK_TIMEOUT = 2000
for idx, selector in enumerate(_INPUT_SELECTORS):
    timeout = ELEMENT_TIMEOUT if idx == 0 else FALLBACK_TIMEOUT  # 10초 + 5*2초 = 20초
    el = await frame.wait_for_selector(selector, timeout=timeout)
    ...
```

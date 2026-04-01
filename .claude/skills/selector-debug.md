# 네이버 셀렉터 디버그 스킬 (selector-debug)

> **트리거**: 아래 표현이 나오면 이 스킬을 즉시 실행한다.
> - "셀렉터 확인" / "셀렉터 업데이트" / "DOM 분석"
> - "댓글 안 달림" / "게시 실패" / "요소 못 찾음"
> - 로그에 `TimeoutError`, `selector not found`, `element not visible` 발생 시

---

## 배경

네이버는 DOM 구조를 예고 없이 변경한다. 댓글 수집(모바일 Playwright)과 게시물 발행(스마트에디터)이 셀렉터에 의존하므로, 변경 시 즉각 대응이 필요하다.

이력:
- 댓글 수집: 데스크톱 cbox JS 미로드 → **모바일 Playwright** 전환 (03-11)
- 댓글 버튼: `a._commentCount` → `[class*="comment_btn"]` 변경
- 블로그 ID: `a.u_cbox_name` → `blogId=` 파라미터 추출로 변경

---

## 실행 순서 (순서 준수 필수)

### STEP 1 — 증상 파악

먼저 어떤 기능이 실패했는지 확인한다:

| 증상 | 관련 파일 | 관련 셀렉터 |
|------|----------|------------|
| 댓글 수집 실패 | `src/collectors/comment_collector.py` | `[class*="comment_btn"]`, `a.u_cbox_name` |
| 게시물 수집 실패 | `src/collectors/post_collector.py` | logNo 정규식, `mainFrame` |
| 댓글 작성 실패 | `src/commenter/comment_writer.py` | iframe 셀렉터 |
| 게시물 발행 실패 | `src/publisher/blog_publisher.py` | 스마트에디터 셀렉터 |

### STEP 2 — 디버그 도구 실행

```bash
cd /home/window11/insung_blog
source .venv/bin/activate
python debug_publisher.py
```

`debug_publisher.py`가 수행하는 것:
- 네이버 로그인 → 블로그 에디터 접속
- DOM 트리 스냅샷 저장
- 주요 요소 스크린샷 촬영
- 현재 셀렉터 검증 결과 출력

스크린샷 확인:
```bash
ls -lt screenshots/ 2>/dev/null | head -5
```

### STEP 3 — DOM 분석

디버그 출력 또는 수동으로 DOM을 분석한다:

**댓글 수집 (모바일 페이지)**:
```python
# 모바일 블로그 페이지에서 댓글 영역 확인
page.goto("https://m.blog.naver.com/{blogId}/{logNo}")
# 댓글 버튼 — 현재 셀렉터
comment_btn = page.locator('[class*="comment_btn"]')
# 댓글 영역 — cbox 또는 새 형식
```

**게시물 발행 (스마트에디터)**:
```python
# 에디터 접속
page.goto("https://blog.naver.com/{blogId}/postwrite")
# 주요 셀렉터: 제목 입력, 본문 iframe, 발행 버튼 등
```

### STEP 4 — 셀렉터 비교

변경 전/후 셀렉터를 대조한다:

```
셀렉터 변경 감지 — {날짜}

| 기능 | 기존 셀렉터 | 현재 DOM | 상태 |
|------|------------|----------|------|
| 댓글 버튼 | [class*="comment_btn"] | {확인된 셀렉터} | OK/NG |
| 블로그 ID | blogId= 파라미터 | {확인된 방식} | OK/NG |
| 에디터 제목 | {기존} | {확인된 셀렉터} | OK/NG |
```

### STEP 5 — 코드 업데이트 (확인 후)

변경이 필요한 셀렉터를 사용자에게 보고하고, 승인 후 코드를 수정한다.

수정 대상 파일과 해당 셀렉터를 명시:
```
수정 제안:
  파일: src/collectors/comment_collector.py:42
  변경: '[class*="comment_btn"]' → '{새 셀렉터}'
  이유: 네이버 모바일 DOM 변경

  수정할까요? [Y/n]
```

### STEP 6 — 검증

수정 후 dry-run으로 동작 확인:
```bash
cd /home/window11/insung_blog
source .venv/bin/activate
python main.py --run-once --dry-run
```

---

## 판단 규칙

| 상황 | 행동 |
|------|------|
| 셀렉터 1개 변경 | 해당 파일만 수정 |
| DOM 구조 대폭 변경 | 접근 방식 재설계 필요 → 사용자 논의 |
| iframe 구조 변경 | comment_writer.py 전면 검토 |
| cbox 완전 제거 | 모바일 접근 방식 유지 여부 판단 |
| 디버그 도구 자체 실패 | 로그인 쿠키 확인 → `cookie-refresh` 스킬 |

---

## 주의사항

- headed 모드(`headless=False`)로 실행해야 스크린샷이 의미 있음
- 네이버 봇 감지 주의 — 디버그 시에도 `delay.py`의 지연 적용
- 셀렉터 변경 후 반드시 dry-run 검증
- 변경 이력을 커밋 메시지에 명확히 기록 (어떤 셀렉터가 왜 바뀌었는지)

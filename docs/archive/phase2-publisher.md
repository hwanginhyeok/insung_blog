# Phase 2 — 게시물 자동 발행

> 태스크: #5, #6
> 선행 조건: Phase 1 완료, Claude API 키

---

## 목표

1. `content_generator.py` — 사진 + 메모 → AI 블로그 초안 + 해시태그 생성
2. `blog_publisher.py` — Playwright로 네이버 스마트에디터 조작 → 실제 게시

---

## Task #6 — content_generator.py

### 입력/출력

```
입력: 사진 파일 1~5장 (bytes) + 메모 텍스트 (선택)
출력: {
    "title": "강남 이탈리안 맛집 후기 — 분위기도 음식도 완벽했어요",
    "body": "...(본문 500~800자)...",
    "hashtags": ["강남맛집", "강남이탈리안", "파스타맛집", ...],
}
```

### 처리 흐름

```
1단계: 사진 분석 (Claude Vision)
    - 모든 사진을 base64로 인코딩
    - "이 사진들에서 보이는 음식, 장소, 분위기를 설명해줘" 요청
    - 출력: 이미지 설명 텍스트

2단계: 초안 생성 (Claude Opus)
    - 시스템 프롬프트: skills/writing_style.md 내용 포함
    - 입력: 이미지 설명 + 메모
    - 출력: 제목 + 본문

3단계: 해시태그 생성 (Claude Haiku)
    - 본문 기반으로 3계층 해시태그 생성
    - 네이버 검색 유입 최적화
```

### 해시태그 3계층 전략

```python
HASHTAG_PROMPT = """
아래 블로그 글에 맞는 네이버 블로그 해시태그를 생성해줘.

규칙:
- 총 20~25개
- 계층 1 (위치, 5개): 지역명+업종 조합 ex) #강남맛집 #강남파스타 #서울이탈리안
- 계층 2 (카테고리, 10개): 음식/장소 종류 ex) #파스타맛집 #이탈리안레스토랑 #크림파스타
- 계층 3 (감성, 10개): 분위기/상황 ex) #데이트맛집 #분위기좋은식당 #서울데이트

JSON 배열로 반환: ["태그1", "태그2", ...]
"""
```

### writing_style.md 참조 방식

```python
def load_writing_style() -> str:
    style_path = PROJECT_ROOT / "skills" / "writing_style.md"
    if style_path.exists():
        return style_path.read_text(encoding="utf-8")
    return ""  # 파일 없으면 기본 스타일로 생성
```

### 초기 시스템 프롬프트 (skills/writing_style.md 초안)

```markdown
# 블로그 글쓰기 스타일 가이드

## 말투
- 친근한 해요체 (~했어요, ~이에요, ~예요)
- 지나치게 격식체 금지

## 구조
1. 도입: 방문 계기나 기대감 (2~3문장)
2. 메인: 음식/장소 설명 + 사진 설명 (4~6문장)
3. 마무리: 개인 감상 + 추천 여부 (2~3문장)

## 길이
- 본문: 500~800자
- 제목: 25자 이내

## 금지 표현
- "오늘은~", "안녕하세요~" 같은 뻔한 도입부
- 과도한 광고성 표현
- 별점 수치 나열

## 피드백 이력
(피드백 쌓이면 여기에 추가됨)
```

---

## Task #5 — blog_publisher.py

### 네이버 스마트에디터 3.0 접근 방식

스마트에디터는 iframe 기반 + 커스텀 에디터 구조로 복잡함.
DOM 분석이 필요하므로 **개발 시 debug 스크립트로 먼저 구조 파악**.

```python
# 진입 URL
BLOG_WRITE_URL = "https://blog.naver.com/PostWrite.naver?blogId={blog_id}"
```

### 예상 구현 흐름

```python
async def publish_post(page, title: str, body: str,
                       image_paths: list[Path], hashtags: list[str]) -> str:
    """
    네이버 블로그에 게시물 발행.
    Returns: 게시된 포스트 URL
    """
    # 1. 글쓰기 페이지 이동
    await page.goto(BLOG_WRITE_URL.format(blog_id=MY_BLOG_ID))
    await page.wait_for_load_state("networkidle")

    # 2. 제목 입력
    await _input_title(page, title)

    # 3. 사진 업로드
    for image_path in image_paths:
        await _upload_image(page, image_path)

    # 4. 본문 입력
    await _input_body(page, body)

    # 5. 해시태그 입력
    await _input_hashtags(page, hashtags)

    # 6. 발행 버튼 클릭
    post_url = await _click_publish(page)
    return post_url
```

### 스마트에디터 DOM 분석 필요 항목

개발 전 `debug_publisher.py` 스크립트로 아래 확인 필요:

| 확인 항목 | 목적 |
|-----------|------|
| 제목 입력 필드 셀렉터 | `.se-title-input` 또는 `[placeholder*="제목"]` |
| 본문 에디터 프레임 | iframe id/name, 또는 contenteditable div |
| 이미지 업로드 버튼 | 파일 선택 input 또는 드래그앤드롭 |
| 해시태그 입력 필드 | `.tag_input` 또는 `[placeholder*="태그"]` |
| 발행 버튼 | `.publish_btn` 계열 |

### image_uploader.py 설계

```python
async def upload_images(page, image_paths: list[Path]) -> None:
    """
    방법 1: 파일 input 직접 접근
        file_input = await page.query_selector("input[type='file']")
        await file_input.set_input_files(image_paths)

    방법 2: 드래그앤드롭 (방법 1 실패 시)
        page.drag_and_drop(source, target)
    """
```

---

## 개발 순서

1. `debug_publisher.py` 작성 → 스마트에디터 DOM 구조 캡처
2. 제목/본문 입력 구현 및 테스트
3. 이미지 업로드 구현
4. 해시태그 입력 구현
5. 발행 버튼 + URL 수집 구현
6. `content_generator.py` 구현
7. 두 모듈 연결 테스트

---

## 예상 이슈

| 이슈 | 대응 방법 |
|------|-----------|
| 스마트에디터 iframe 중첩 | comment_writer.py의 iframe 탐색 패턴 재활용 |
| contenteditable 입력 | `page.keyboard.type()` 또는 `element.fill()` 테스트 |
| 이미지 업로드 타임아웃 | 업로드 완료 확인 셀렉터 대기 |
| 발행 후 URL 수집 | `page.wait_for_url()` 또는 응답 URL 캡처 |

---

## 모델 선택

| 작업 | 모델 | 이유 |
|------|------|------|
| 이미지 분석 | claude-opus-4-6 | Vision 정확도 |
| 초안 생성 | claude-opus-4-6 | 글 품질 중요 |
| 해시태그 생성 | claude-haiku-4-5 | 단순 목록 생성, 비용 절약 |

건당 예상 비용: ~$0.04 (이미지 3장 기준)

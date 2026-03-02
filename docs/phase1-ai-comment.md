# Phase 1 — 댓글 봇 AI화

> 태스크: #2, #3, #4
> 선행 조건: Task #1 (Claude API 키)

---

## 목표

기존 `phrases.py` 고정 문구 방식을 폐기하고,
Claude API가 실제 게시물 본문을 읽고 내용에 맞는 댓글을 생성하는 방식으로 전환.

---

## 현재 방식 vs 목표 방식

### 현재 (phrases.py)
```python
# 미리 정해진 50개 문구 중 랜덤 선택
"'{title}' 잘 읽었어요! 항상 좋은 글 감사드립니다 :)"
"좋은 글 감사해요. 자주 올게요 ^^"
```
**문제점**: 어떤 글이든 동일한 패턴 → 봇처럼 보임, 실제 방문 효과 없음

### 목표 (ai_comment.py)
```python
# 본문 읽고 생성
"오늘 소개하신 강남 이탈리안, 크림파스타 비주얼이 정말 맛있어 보여요!
 저도 근처 가면 꼭 들러봐야겠어요 😊"
```
**장점**: 글 내용 언급 → 진짜 읽은 것처럼 자연스러움, 봇 감지 위험 감소

---

## 구현 계획

### 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/commenter/ai_comment.py` | 신규 생성 — Claude API 댓글 생성 |
| `src/commenter/comment_writer.py` | `pick_phrase()` → `generate_comment()` 호출로 교체 |
| `config/settings.py` | ALLOWED_HOUR 변경 + ANTHROPIC 설정 추가 |
| `.env` | `ANTHROPIC_API_KEY` 추가 |

---

### ai_comment.py 설계

```python
"""
Claude Haiku를 사용해 게시물 본문 기반 맞춤 댓글 생성.
비용 최소화: claude-haiku-4-5 사용 (opus 대비 1/10 비용)
"""

async def generate_comment(post_title: str, post_body: str) -> str:
    """
    게시물 제목 + 본문 → 맞춤 댓글 생성
    본문이 없으면 제목만으로 생성 (폴백)
    """

SYSTEM_PROMPT = """
너는 네이버 블로그에 진심 어린 댓글을 다는 방문자야.
아래 규칙을 반드시 지켜:
1. 글의 핵심 내용(음식명, 장소, 감정 등)을 1가지 이상 구체적으로 언급
2. 친근한 구어체 (해요체)
3. 1~2문장으로 짧고 자연스럽게
4. 이모지 1개 이하
5. 광고성/홍보성 표현 금지
6. "잘 읽었어요" 같은 뻔한 시작 금지
"""
```

**본문 스크래핑 추가 위치**: `comment_writer.py`의 `write_comment()`
- `page.goto(post_url)` 이후
- `mainFrame`에서 `.se-main-container, .post-view` 등으로 본문 텍스트 추출
- 500자 이내로 자르고 Claude에 전달

---

### 본문 스크래핑 셀렉터 (mainFrame 기준)

```python
BODY_SELECTORS = [
    ".se-main-container",      # 스마트에디터 3.0 (신형)
    ".post-view",              # 구형 에디터
    ".se_component_wrap",      # 스마트에디터 2.0
    "#postViewArea",           # 레거시
    ".post_ct",                # 레거시 2
]
```

---

### settings.py 변경 사항

```python
# 현재
ALLOWED_HOUR_START = 9
ALLOWED_HOUR_END = 23

# 변경
ALLOWED_HOUR_START = 20   # 오후 8시
ALLOWED_HOUR_END = 24     # 자정

# 추가
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
COMMENT_AI_MODEL = "claude-haiku-4-5-20251001"   # 비용 최적화
COMMENT_MAX_BODY_CHARS = 500                       # 본문 전달 최대 길이
```

---

### .env 추가 항목

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

---

## 댓글 1~3개 랜덤 (기존 → 유지)

현재 `POSTS_PER_BLOGGER_MIN=3`, `MAX=5` 로 게시물 수를 랜덤 선택.
댓글 개수는 게시물 수와 같으므로 이 설정으로 자연스럽게 1~3개 범위로 조정:

```python
# settings.py
POSTS_PER_BLOGGER_MIN = 1   # 최소 1개
POSTS_PER_BLOGGER_MAX = 3   # 최대 3개
```

---

## 비용 추정

| 항목 | 값 |
|------|-----|
| 모델 | claude-haiku-4-5 |
| 입력 토큰 (본문 500자 + 프롬프트) | ~300 tokens |
| 출력 토큰 (댓글 1~2문장) | ~60 tokens |
| 건당 비용 | ~$0.0001 |
| 하루 30댓글 | ~$0.003 |
| **월 비용** | **~$0.09** |

---

## 테스트 계획

1. `python main.py --run-once --dry-run --test-visit [공개블로그ID]`
2. 생성된 댓글 텍스트 확인 (로그에서)
3. 내용 연관성 체크 → 시스템 프롬프트 조정
4. `--dry-run` 제거 후 실제 게시물에 댓글 테스트

### 테스트용 공개 블로그 조건
- 댓글 허용 (서로이웃 제한 없음)
- 최근 게시물 있음
- 맛집/여행 관련 글 (프롬프트 최적화 확인)

---

## Task #4 — 테스트용 게시물 작성

댓글 봇 수집 파이프라인 전체 테스트를 위해 `letter_hih` 블로그에 게시물 필요.

**최소 요건**:
- 게시물 2개 이상
- 공개 설정
- 댓글 허용 설정

게시물 작성 후 다른 계정(또는 지인)이 댓글을 달면 → 수집 → 답방 전체 파이프라인 테스트 가능.

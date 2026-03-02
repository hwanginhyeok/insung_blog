# Phase 4 — 피드백 루프 (AI 스킬 업그레이드)

> 태스크: #8
> 선행 조건: Phase 3 완료

---

## 목표

게시물을 발행할 때마다 피드백을 수집하고,
`skills/writing_style.md`에 누적하여 다음 글 생성 품질을 점진적으로 향상.

파인튜닝 없이 **프롬프트 엔지니어링**으로 스타일을 개선하는 구조.

---

## 피드백 수집 흐름

```
게시 완료
    ↓
텔레그램: "이번 글 어떠셨나요? 피드백 남겨주세요 (없으면 /skip)"
    ↓
사용자 입력 (선택)
    ↓
skill_manager.py 처리
    ↓
writing_style.md 업데이트
```

### 피드백 입력 형식 (자유 텍스트)

```
"도입부가 너무 딱딱해. 좀 더 가볍게"
"음식 설명 디테일 더 넣어줘"
"이번 건 좋았어"
"해시태그 위치 관련 태그가 부족해"
```

---

## skill_manager.py 설계

```python
"""
피드백을 분석해서 writing_style.md를 업데이트하는 모듈.
"""

SKILL_UPDATE_PROMPT = """
아래는 현재 글쓰기 스타일 가이드야:
---
{current_style}
---

이번 발행 게시물:
제목: {post_title}
내용 요약: {post_summary}

사용자 피드백:
"{feedback}"

피드백을 반영해서 스타일 가이드를 업데이트해줘.
- 기존 내용과 충돌하면 새 피드백 우선
- "피드백 이력" 섹션에 날짜와 함께 핵심 요점 추가
- 전체 파일 내용으로 반환
"""

async def update_style(post_title: str, post_summary: str, feedback: str) -> None:
    current = load_writing_style()
    updated = await call_claude(SKILL_UPDATE_PROMPT.format(...))
    save_writing_style(updated)
```

---

## writing_style.md 구조

```markdown
# 블로그 글쓰기 스타일 가이드

## 말투
...

## 구조
...

## 길이
...

## 금지 표현
...

## 피드백 이력
| 날짜 | 게시물 | 피드백 요점 |
|------|--------|-------------|
| 2026-03-05 | 강남 이탈리안 후기 | 도입부 더 가볍게, 음식 디테일 강화 |
| 2026-03-08 | 홍대 카페 방문 | 해시태그 위치 태그 보강 |
```

---

## DB 연동 (database.py 확장)

피드백 이력을 DB에도 저장 (조회/분석 목적):

```sql
CREATE TABLE IF NOT EXISTS post_feedback (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    post_url     TEXT NOT NULL,
    post_title   TEXT NOT NULL,
    feedback     TEXT NOT NULL,
    applied_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

---

## 스킬 업그레이드 효과 측정

피드백 10회 누적 후:
- 글 길이 변화 추적
- 해시태그 수 변화 추적
- 사용자가 "다시쓰기" 버튼 누른 비율 감소 여부

---

## 주의사항

- 피드백이 모순될 경우 (최신 피드백 우선)
- 스타일 가이드가 지나치게 길어지면 Claude 컨텍스트 초과 → 3000자 이내로 유지
- `/skip` 입력 시 피드백 없이 넘어감 (강제하지 않음)

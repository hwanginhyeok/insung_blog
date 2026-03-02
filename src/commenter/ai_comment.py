"""
AI 댓글 생성 모듈 — Claude Haiku로 게시물 본문을 읽고 맞춤 댓글 생성

사용 흐름:
  1. comment_writer.py에서 게시물 본문 텍스트를 추출
  2. generate_comment(post_text, post_title) 호출
  3. Claude가 본문 맥락에 맞는 자연스러운 댓글 반환
  4. API 장애 시 기존 phrases.py 폴백
"""
import os

from anthropic import Anthropic

from src.commenter.phrases import pick_phrase
from src.utils.logger import logger

_client: Anthropic | None = None

# 본문이 너무 길면 앞부분만 사용 (토큰 절약)
_MAX_BODY_CHARS = 1500

_SYSTEM_PROMPT = """\
너는 네이버 블로그 댓글을 작성하는 한국인 블로거야.
다음 규칙을 반드시 따라:
- 해요체 사용 (~했어요, ~이에요, ~네요)
- 1~2문장, 30~80자 이내
- 게시물 본문의 핵심 내용을 구체적으로 언급해서 진짜 읽은 것처럼
- 호의적이고 따뜻한 톤
- 이모티콘은 최대 1개만 (😊 🤗 ☺️ 👍 중 택1, 안 써도 됨)
- "좋은 글 감사합니다" 같은 뻔한 표현 금지
- 첫 방문인지 재방문인지 언급 금지 (알 수 없으므로)
- 날씨/시간대 언급 금지
- 질문형으로 끝내도 좋음 (재방문 유도)
- 광고성 느낌 절대 금지
댓글 텍스트만 출력해. 따옴표, 설명, 부가 텍스트 없이 댓글 내용만."""


def _get_client() -> Anthropic | None:
    """Anthropic 클라이언트 싱글톤. API 키 없으면 None 반환."""
    global _client
    if _client is not None:
        return _client

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY 미설정 — AI 댓글 비활성, phrases 폴백 사용")
        return None

    _client = Anthropic(api_key=api_key)
    return _client


def generate_comment(post_text: str, post_title: str) -> str:
    """
    게시물 본문+제목을 바탕으로 AI 댓글 생성.

    Args:
        post_text: 게시물 본문 텍스트 (빈 문자열 가능)
        post_title: 게시물 제목

    Returns:
        생성된 댓글 문자열. API 실패 시 phrases 폴백.
    """
    client = _get_client()
    if client is None:
        return pick_phrase(post_title)

    # 본문이 비거나 너무 짧으면 폴백
    body = post_text.strip()
    if len(body) < 20:
        logger.debug("본문 너무 짧음 — phrases 폴백")
        return pick_phrase(post_title)

    # 본문 길이 제한 (토큰 절약)
    if len(body) > _MAX_BODY_CHARS:
        body = body[:_MAX_BODY_CHARS] + "…"

    user_message = f"[제목] {post_title}\n\n[본문]\n{body}"

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=150,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        comment = response.content[0].text.strip()

        # 빈 응답이거나 너무 짧은 경우 폴백
        if len(comment) < 5:
            logger.warning("AI 응답 너무 짧음 — phrases 폴백")
            return pick_phrase(post_title)

        # 따옴표 래핑 제거 (모델이 가끔 감쌈)
        if comment.startswith('"') and comment.endswith('"'):
            comment = comment[1:-1]

        logger.info(f"AI 댓글 생성 완료 ({len(comment)}자): {comment[:50]}...")
        return comment

    except Exception as e:
        logger.warning(f"AI 댓글 생성 실패 — phrases 폴백: {e}")
        return pick_phrase(post_title)

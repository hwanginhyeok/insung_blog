"""
AI 답글(대댓글) 생성 모듈 — 내 블로그에 달린 댓글에 블로그 주인으로서 답글 생성.

기존 ai_comment.py의 Ollama+Anthropic 구조를 재사용하되,
프롬프트를 "블로그 주인의 답글" 톤으로 변경.

사용 흐름:
  1. 방문자 댓글 내용 + 게시물 제목 입력
  2. Ollama 우선 시도 → 실패 시 Anthropic 폴백
  3. 후처리 후 답글 텍스트 반환
"""
import random

from src.commenter.ai_comment import (
    _call_ollama,
    _check_ollama,
    _get_client,
    _is_valid_comment,
    _clean_comment,
)
from src.commenter.comment_post_processor import process as post_process
from src.utils.logger import setup_logger
from config.settings import COMMENT_AI_MODEL

logger = setup_logger("ai_reply")


# 답글 전용 시스템 프롬프트
_REPLY_SYSTEM = """\
너는 네이버 블로그 주인이야. 내 글에 댓글을 남긴 방문자에게 따뜻하게 답글을 달아.

[필수 규칙]
- 2~4줄, 80~150자
- 해요체 (~했어요, ~이에요, ~감사해요)
- 댓글 내용에 구체적으로 반응 (단순 "감사합니다" 금지)
- 질문이 있으면 간단히 답변
- 다시 방문해달라는 느낌을 자연스럽게
- 이모지/이모티콘 1~2개 자연스럽게 사용
- AI 티 안 나게, 진짜 블로거처럼

[금지]
- "안녕하세요", "반갑습니다" 같은 형식적 인사로 시작 금지
- 질문으로 끝내기 금지
- 댓글 내용을 그대로 반복 금지
- 마케팅/홍보 느낌 금지
- 해시태그(#) 절대 금지
- 200자 이상 길게 쓰지 말 것
"""

# 톤 변형 (답글용)
_REPLY_TONES = [
    "감사 + 공감",       # 댓글 고맙다 + 내용에 공감
    "추가 정보 공유",     # 댓글에 관련된 추가 팁/정보
    "따뜻한 환영",       # 다시 놀러오라는 느낌
]

# 정적 폴백 답글 (AI 실패 시)
_FALLBACK_REPLIES = [
    "댓글 남겨주셔서 감사해요! 좋은 하루 보내세요 😊",
    "방문해주시고 댓글까지 감사합니다! 또 놀러오세요 ㅎㅎ",
    "소중한 댓글 감사해요! 앞으로도 좋은 글 쓸게요 💕",
    "읽어주셔서 감사합니다! 다음에 또 좋은 글로 찾아올게요 ㅎㅎ",
    "댓글 남겨주셔서 너무 기뻐요! 또 놀러와주세요 😊",
]


def generate_reply(
    comment_text: str,
    post_title: str,
    commenter_name: str | None = None,
    custom_prompt: str | None = None,
    persona_tone: str | None = None,
) -> str:
    """
    방문자 댓글에 대한 AI 답글 생성.

    Args:
        comment_text: 방문자 댓글 내용
        post_title: 게시물 제목
        commenter_name: 댓글 작성자 닉네임
        custom_prompt: 사용자 커스텀 프롬프트
        persona_tone: 페르소나 톤

    Returns:
        답글 텍스트
    """
    tone = random.choice(_REPLY_TONES)

    # 시스템 프롬프트 구성 (persona_tone은 reply용으로 이미 빌드됨)
    system = _REPLY_SYSTEM
    if persona_tone:
        system += f"\n\n{persona_tone}"
    if custom_prompt:
        system += f"\n\n[추가 지시] {custom_prompt}"

    # 사용자 메시지 구성
    commenter_label = commenter_name or "방문자"
    user_msg = (
        f"[내 게시물 제목] {post_title}\n"
        f"[{commenter_label}의 댓글] {comment_text}\n"
        f"[톤] {tone}\n\n"
        f"위 댓글에 블로그 주인으로서 답글을 작성해줘."
    )

    def _trim_reply(text: str) -> str:
        """답글 길이 하드캡 (200자). 문장 단위로 자름."""
        if len(text) <= 200:
            return text
        # 200자 이내에서 마지막 문장 부호 찾기
        cut = text[:200]
        for sep in [".", "!", "요", "요!", "네요", "세요"]:
            last = cut.rfind(sep)
            if last > 80:
                return cut[:last + len(sep)]
        return cut.rstrip() + "..."

    # 1차: Ollama 시도
    if _check_ollama():
        ollama_reply = _call_ollama(system, user_msg, max_tokens=200)
        if ollama_reply:
            reply = _clean_comment(ollama_reply)
            if len(reply) >= 30 and _is_valid_comment(reply):
                result = _trim_reply(post_process(reply))
                logger.info(f"Ollama 답글 생성 ({len(result)}자): {result[:40]}...")
                return result

    # 2차: Anthropic
    try:
        client = _get_client()
        response = client.messages.create(
            model=COMMENT_AI_MODEL,
            max_tokens=200,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
        reply = response.content[0].text.strip()
        reply = _clean_comment(reply)
        if len(reply) >= 30 and _is_valid_comment(reply):
            result = _trim_reply(post_process(reply))
            logger.info(f"Anthropic 답글 생성 ({len(result)}자): {result[:40]}...")
            return result
    except Exception as e:
        logger.warning(f"Anthropic 답글 생성 실패: {e}")

    # 3차: 정적 폴백
    fallback = random.choice(_FALLBACK_REPLIES)
    logger.warning(f"AI 답글 실패 → 폴백 사용: {fallback[:30]}...")
    return fallback


def generate_replies_batch(
    comments: list[dict],
    custom_prompt: str | None = None,
    persona_tone: str | None = None,
) -> list[str]:
    """여러 댓글에 대한 답글을 순차 생성."""
    results = []
    for c in comments:
        reply = generate_reply(
            comment_text=c.get("comment_text", ""),
            post_title=c.get("post_title", ""),
            commenter_name=c.get("commenter_name"),
            custom_prompt=custom_prompt,
            persona_tone=persona_tone,
        )
        results.append(reply)
    return results

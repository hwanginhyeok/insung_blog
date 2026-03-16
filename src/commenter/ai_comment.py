"""
AI 댓글 생성 모듈 — Claude Haiku로 게시물 본문을 읽고 맞춤 댓글 생성

원칙:
  - 내용을 바탕으로 공감하되, 확실한 것만 언급
  - 애매한 구체적 정보(특정 메뉴, 가격, 위치)는 언급하지 않음
  - 질문 금지 (답변 유도 리스크)
  - AI 티 안 나게 자연스럽게

사용 흐름 (배치):
  1. orchestrator가 블로거의 게시물 3개씩 묶어서 본문 추출
  2. generate_comments_batch(posts, recent_comments) 호출
  3. Claude가 3개 게시물 각각에 맞는 댓글을 한 번에 반환
  4. 유효성/중복 체크 후 리스트 반환, 실패 시 phrases 폰백

사용 흐름 (단건, 폴백):
  1. generate_comment(post_text, post_title, recent_comments) 호출
  2. API 장애 시 phrases.py 폰백
"""
import os
import random
from difflib import SequenceMatcher

from anthropic import Anthropic

from config.settings import COMMENT_AI_MODEL
from src.commenter.phrases import pick_phrase
from src.utils.logger import logger

_client: Anthropic | None = None

# 본문이 너무 길면 앞부분만 사용 (토큰 절약)
_MAX_BODY_CHARS = 1000

# 비정상 응답 패턴 (AI가 본문을 이해 못 했다는 식의 응답)
_INVALID_RESPONSE_PATTERNS = [
    "죄송",
    "블로그 본문",
    "로드되지 않",
    "댓글을 작성할 수 없",
    "AI 어시스턴트",
    "assistant",
    "invalid",
    "unable to",
    "cannot",
]  

# 게시물 작성 스타일과 통일된 규칙
_BASE_RULES = """\
말투와 스타일 (게시물과 동일한 결이):
- 친근한 해요체 (~했어요, ~이에요, ~예요, ~네요)
- 가볍고 일상적인 톤, 지나치게 격식체 금지
- 뻔한 인사("안녕하세요")나 광고성 표현 금지

내용:
- 확실하게 아는 것만 언급 (본문/사진에서 명확히 보이는 것)
- 모륨면 언급하지 말 것 (추측, 추론 금지)

형식: 1문장, 짧게 (20~45자)
출력: 댓글 텍스트만"""

# 게시물 작성 스타일과 통일된 톤
_SYSTEM_TONE = (
    "너는 네이버 블로그를 자주 보는 30대 직장인이야. "
    "친근하고 가벼운 톤으로 글과 사진을 보고 느낀 점을 자연스럽게 남겨."
)


def _build_system_prompt() -> str:
    """시스템 프롬프트 조합 (일관된 톤)."""
    return f"{_SYSTEM_TONE}\n{_BASE_RULES}"


def _get_client() -> Anthropic | None:
    """Anthropic 클라이언트 싱글톤. API 키 없으면 None 반환."""
    global _client
    if _client is not None:
        return _client

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY 미설정 — AI 댓글 비활성, phrases 폰백 사용")
        return None

    _client = Anthropic(api_key=api_key)
    return _client


def _is_similar(text1: str, text2: str, threshold: float = 0.7) -> bool:
    """두 텍스트의 유사도가 threshold 이상이면 True"""
    if not text1 or not text2:
        return False
    return SequenceMatcher(None, text1, text2).ratio() >= threshold


def _is_valid_comment(comment: str) -> bool:
    """AI 응답이 정상적인 댓글인지 검사"""
    if not comment or len(comment) < 5:
        return False
    
    comment_lower = comment.lower()
    for pattern in _INVALID_RESPONSE_PATTERNS:
        if pattern.lower() in comment_lower:
            logger.warning(f"비정상 AI 응답 감지 ('{pattern}' 포함): {comment[:50]}...")
            return False
    
    return True


def generate_comment(
    post_text: str,
    post_title: str,
    recent_comments: list[str] | None = None,
) -> str:
    """
    게시물 본문+제목을 바탕으로 AI 댓글 생성.
    중복 방지를 위해 최근 댓글 목록을 받아 유사도 체크 수행.

    Args:
        post_text: 게시물 본문 텍스트 (빈 문자열 가능)
        post_title: 게시물 제목
        recent_comments: 최근 해당 블로거에게 단 댓글 목록 (중복 체크용)

    Returns:
        생성된 댓글 문자열. API 실패 시 phrases 폰백.
    """
    client = _get_client()
    if client is None:
        return pick_phrase(post_title)

    # 본문이 비거나 너무 짧으면 폰백
    body = post_text.strip()
    if len(body) < 20:
        logger.debug("본문 너무 짧음 — phrases 폰백")
        return pick_phrase(post_title)

    # 본문 길이 제한 (토큰 절약)
    if len(body) > _MAX_BODY_CHARS:
        body = body[:_MAX_BODY_CHARS] + "…"

    recent_comments = recent_comments or []

    # 최대 3번 시도 (중복 시 재생성)
    for attempt in range(3):
        try:
            system_prompt = _build_system_prompt()
            user_message = f"[제목] {post_title}\n\n[본문]\n{body}"

            response = client.messages.create(
                model=COMMENT_AI_MODEL,
                max_tokens=100,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            comment = response.content[0].text.strip()

            # 빈 응답이거나 너무 짧은 경우
            if len(comment) < 5:
                logger.warning(f"AI 응답 너무 짧음 (시도 {attempt + 1}/3)")
                continue

            # 따옴표 래핑 제거
            if comment.startswith('"') and comment.endswith('"'):
                comment = comment[1:-1]

            # 최대 길이 제한
            if len(comment) > 50:
                comment = comment[:47] + "..."

            # 비정상 응답 체크
            if not _is_valid_comment(comment):
                logger.warning(f"비정상 응답, 재시도 (시도 {attempt + 1}/3)")
                continue
            
            # 중복 체크
            is_duplicate = any(_is_similar(comment, rc) for rc in recent_comments)
            if is_duplicate:
                logger.debug(f"중복 댓글 감지, 재생성 (시도 {attempt + 1}/3)")
                continue

            logger.info(f"AI 댓글 생성 완료 ({len(comment)}자): {comment[:40]}...")
            return comment

        except Exception as e:
            logger.warning(f"AI 댓글 생성 오류 (시도 {attempt + 1}/3): {e}")
            continue

    # 3번 모두 실패하면 phrases 폰백
    logger.warning("AI 댓글 3회 실패 — phrases 폰백")
    return pick_phrase(post_title)


def _clean_comment(comment: str) -> str:
    """댓글 후처리: 따옴표 제거 + 길이 제한."""
    if comment.startswith('"') and comment.endswith('"'):
        comment = comment[1:-1]
    if len(comment) > 50:
        comment = comment[:47] + "..."
    return comment


def _parse_batch_response(text: str, count: int) -> list[str]:
    """배치 응답 파싱. '1: 댓글내용' 또는 '1. 댓글내용' 형식."""
    comments: dict[int, str] = {}
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        for sep in [":", ".", ")"]:
            if sep in line:
                parts = line.split(sep, 1)
                try:
                    idx = int(parts[0].strip())
                    comment = parts[1].strip()
                    if comment and 1 <= idx <= count:
                        comments[idx] = comment
                        break
                except (ValueError, IndexError):
                    continue
    return [comments.get(i, "") for i in range(1, count + 1)]


def generate_comments_batch(
    posts: list[dict],
    recent_comments: list[str] | None = None,
) -> list[str]:
    """
    여러 게시물의 댓글을 한 번의 API 호출로 배치 생성.
    시스템 프롬프트 1회 전송으로 토큰 절약.

    Args:
        posts: [{"body": str, "title": str}, ...] (최대 3개 권장)
        recent_comments: 최근 댓글 목록 (중복 방지)

    Returns:
        댓글 리스트 (posts와 동일 순서). 실패 시 phrases 폰백.
    """
    if not posts:
        return []

    recent_comments = recent_comments or []

    # 1건이면 기존 단건 함수 위임
    if len(posts) == 1:
        comment = generate_comment(
            posts[0]["body"], posts[0]["title"], recent_comments
        )
        return [comment]

    client = _get_client()
    if client is None:
        return [pick_phrase(p["title"]) for p in posts]

    # 유효한 게시물만 배치 대상으로 분류
    valid_indices: list[int] = []
    for i, post in enumerate(posts):
        body = post["body"].strip()
        if len(body) >= 20:
            valid_indices.append(i)

    if not valid_indices:
        return [pick_phrase(p["title"]) for p in posts]

    # 프롬프트 조합
    user_parts = []
    for seq, i in enumerate(valid_indices, 1):
        body = posts[i]["body"].strip()
        if len(body) > _MAX_BODY_CHARS:
            body = body[:_MAX_BODY_CHARS] + "…"
        user_parts.append(f"[게시물 {seq}]\n제목: {posts[i]['title']}\n본문:\n{body}")

    user_message = "\n\n---\n\n".join(user_parts)
    user_message += (
        f"\n\n위 {len(valid_indices)}개 게시물에 댓글을 1개씩 작성해. "
        "서로 다른 표현을 써서 다양하게.\n"
        "출력 형식 (번호: 댓글):\n1: 여기 분위기 너무 좋아요\n2: 사진 보니까 가보고 싶어요"
    )

    for attempt in range(2):
        try:
            response = client.messages.create(
                model=COMMENT_AI_MODEL,
                max_tokens=300,
                system=_build_system_prompt(),
                messages=[{"role": "user", "content": user_message}],
            )
            result_text = response.content[0].text.strip()
            parsed = _parse_batch_response(result_text, len(valid_indices))

            # 결과를 원래 인덱스에 매핑
            results: list[str] = [pick_phrase(p["title"]) for p in posts]
            for seq, i in enumerate(valid_indices):
                raw = parsed[seq]
                if raw and _is_valid_comment(raw):
                    comment = _clean_comment(raw)
                    if not any(_is_similar(comment, rc) for rc in recent_comments):
                        results[i] = comment
                        recent_comments.append(comment)

            logger.info(
                f"배치 댓글 생성 완료: {len(valid_indices)}개 요청, "
                f"{sum(1 for seq, i in enumerate(valid_indices) if results[i] != pick_phrase(posts[i]['title']))}개 AI 생성"
            )
            return results

        except Exception as e:
            logger.warning(f"배치 댓글 생성 오류 (시도 {attempt + 1}/2): {e}")
            continue

    logger.warning("배치 댓글 생성 실패 — phrases 폰백")
    return [pick_phrase(p["title"]) for p in posts]

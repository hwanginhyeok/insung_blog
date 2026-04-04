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
import json
import os
import random
import urllib.request
import urllib.error
from difflib import SequenceMatcher

from anthropic import Anthropic

from config.settings import COMMENT_AI_MODEL
from src.commenter.phrases import pick_phrase
from src.commenter.comment_post_processor import process as post_process
from src.utils.logger import logger

_client: Anthropic | None = None

# Ollama 설정 (Anthropic 크레딧 소진 시 폴백)
_OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
_OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma3:4b")
_ollama_available: bool | None = None  # 캐시: None=미확인, True/False

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
    "마케팅 글",
    "홍보",
    "광고 글",
    "스팸",
    "어뷰징",
    "처럼 보이",
    "같은 느낌이",
    "추천하기 어렵",
]

# 게시물 작성 스타일과 통일된 규칙
_BASE_RULES = """\
[필수 형식 규칙 — 반드시 지킬 것]
- 반드시 3~5줄, 줄바꿈(\\n)으로 호흡 나누기
- 총 글자수 120~200자 (100자 미만 실패 처리됨)
- 마지막 줄은 감사/응원으로 마무리

말투와 스타일:
- 친근한 해요체 (~했어요, ~이에요, ~예요, ~네요)
- 가볍고 일상적인 톤, 센스있고 위트있게
- 뻔한 인사("안녕하세요")나 광고성 표현 금지
- 이모티콘/이모지 자연스럽게 섞기 (ㅎㅎ, ㅋㅋ, >,<, ❤️ 등)

내용:
- 본문에서 구체적 정보 2~3가지를 골라서 언급 (메뉴, 장소, 가격, 할인, 분위기 등)
- 확실하게 보이는 것만 언급 (추측 금지)
- 공감 + 나도 해보고 싶다는 느낌 + 감사 표현을 자연스럽게 섞기
- 마케팅/광고성 글이더라도 긍정적인 댓글을 작성. "이건 광고입니다" 같은 메타 댓글 금지.
- 글의 의도를 평가하지 말 것. 항상 독자 입장에서 공감하는 댓글만 작성.

절대 금지:
- 자신의 닉네임/이름/블로그명을 댓글에 절대 넣지 말 것 ("유유베어가", "내가 다녀온" 등 금지)
- 블로그 포스트 요약처럼 쓰지 말 것 — 방문자 댓글이지, 내 글이 아님
- "~가 다녀온", "~가 오늘" 같은 3인칭 서술 금지

출력: 댓글 텍스트만 (번호, 따옴표 없이)"""

# 게시물 작성 스타일과 통일된 톤
_SYSTEM_TONE = (
    "너는 다른 사람의 네이버 블로그에 방문해서 댓글을 남기는 30대 직장인이야. "
    "반드시 3줄 이상, 120자 이상으로 댓글을 써. 한 줄짜리 짧은 댓글은 절대 금지. "
    "글을 꼼꼼히 읽고, 본문 속 구체적인 정보 2~3가지를 골라 "
    "센스있고 위트있게 공감 댓글을 남겨. "
    "줄바꿈(\\n)으로 호흡을 나누고, 이모티콘도 자연스럽게 써."
)

# ── D-1: 톤 랜덤화 ────────────────────────────────────────────────────────────

_TONE_POOLS: dict[str, list[str]] = {
    "감탄형": ["와!", "대박!", "진짜"],
    "공감형": ["맞아요", "저도", "완전"],
    "정보감사형": ["좋은 정보", "유익하네요", "참고할게요"],
}

_TONE_HINTS: dict[str, str] = {
    "감탄형": "감탄하는 느낌으로 시작하거나 중간에 감탄 표현을 자연스럽게 섞어.",
    "공감형": "공감하는 느낌이 강하게 느껴지도록, 나도 그런 경험이 있다는 식으로 써.",
    "정보감사형": "유용한 정보에 감사하는 느낌을 담아서, 덕분에 많이 배웠다는 식으로 써.",
}


def _pick_tone() -> tuple[str, str]:
    """랜덤으로 톤 유형과 힌트를 선택. (tone_type, hint) 반환."""
    tone_type = random.choice(list(_TONE_POOLS.keys()))
    return tone_type, _TONE_HINTS[tone_type]


# ── D-2: 카테고리 감지 ────────────────────────────────────────────────────────

_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "맛집": [
        "맛집", "식당", "레스토랑", "카페", "메뉴", "음식", "맛있", "먹었",
        "주문", "가격", "분위기", "인테리어", "웨이팅", "줄", "포장",
        "배달", "반찬", "셰프", "디저트", "브런치",
    ],
    "여행": [
        "여행", "관광", "여행지", "숙소", "호텔", "펜션", "게스트하우스",
        "해외", "국내", "비행기", "기차", "버스", "렌트카", "코스",
        "일정", "명소", "뷰", "풍경", "바다", "산", "공항",
    ],
    "일상": [
        "일상", "오늘", "하루", "생각", "느낌", "감정", "기분", "힐링",
        "일기", "소소", "행복", "일과", "근황", "요즘", "취미",
    ],
    "IT": [
        "앱", "어플", "소프트웨어", "프로그램", "코딩", "개발", "AI",
        "인공지능", "노트북", "컴퓨터", "스마트폰", "태블릿", "갤럭시",
        "아이폰", "윈도우", "맥", "리눅스", "클라우드", "서버", "API",
        "IT", "테크", "기술", "유튜브 알고리즘", "SEO", "블록체인",
    ],
    "뷰티": [
        "화장품", "스킨케어", "메이크업", "뷰티", "로션", "크림", "세럼",
        "마스크팩", "선크림", "립스틱", "파운데이션", "쿠션", "아이섀도",
        "향수", "헤어", "네일", "피부", "성분", "보습", "미백",
    ],
    "육아": [
        "아이", "육아", "어린이집", "유치원", "초등학교", "엄마", "아빠",
        "출산", "임신", "신생아", "아기", "돌잔치", "이유식", "분유",
        "기저귀", "장난감", "놀이", "성장", "교육", "학원",
    ],
    "재테크": [
        "재테크", "투자", "주식", "펀드", "ETF", "부동산", "청약",
        "저축", "예금", "적금", "금리", "수익", "배당", "연금",
        "절세", "세금", "ISA", "IRP", "코인", "가상화폐", "경제",
    ],
    "리뷰": [
        "리뷰", "후기", "사용기", "솔직", "장단점", "추천", "별점",
        "구매", "제품", "상품", "구독", "서비스", "체험단", "협찬",
    ],
}

_CATEGORY_PROMPT_HINTS: dict[str, str] = {
    "맛집": "이 글은 맛집/음식 관련 글이야. 음식 맛, 분위기, 서비스, 가성비 등에 공감하는 댓글을 써.",
    "여행": "이 글은 여행 관련 글이야. 여행지의 매력, 풍경, 여행 경험에 공감하고 나도 가보고 싶다는 느낌을 담아.",
    "일상": "이 글은 일상 관련 글이야. 소소한 일상에 공감하고 따뜻하게 응원하는 댓글을 써.",
    "IT": "이 글은 IT/테크 관련 글이야. 기술 정보나 제품 특징에 공감하고 유용한 정보에 감사하는 댓글을 써.",
    "뷰티": "이 글은 뷰티/화장품 관련 글이야. 제품 효과, 발색, 사용감 등에 공감하고 나도 써보고 싶다는 느낌을 담아.",
    "육아": "이 글은 육아 관련 글이야. 아이 키우는 경험에 공감하고 따뜻하게 응원하는 댓글을 써.",
    "재테크": "이 글은 재테크/투자 관련 글이야. 유익한 금융 정보에 감사하고 나도 시도해봐야겠다는 느낌을 담아.",
    "리뷰": "이 글은 제품/서비스 리뷰 글이야. 솔직한 후기에 감사하고 구매 결정에 도움이 됐다는 느낌을 담아.",
}


def _detect_category(title: str, body: str) -> str | None:
    """
    제목 + 본문 키워드로 카테고리 감지.
    가장 많이 매칭된 카테고리 반환. 매칭 없으면 None.
    """
    combined = (title + " " + body).lower()
    scores: dict[str, int] = {}
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in combined)
        if count > 0:
            scores[cat] = count
    if not scores:
        return None
    return max(scores, key=lambda c: scores[c])


def _build_system_prompt(
    custom_rules: str | None = None,
    tone_hint: str | None = None,
    avoid_starters: list[str] | None = None,
    category_hint: str | None = None,
    persona_tone: str | None = None,
) -> str:
    """
    시스템 프롬프트 조합.

    Args:
        custom_rules: 사용자 정의 규칙. 있으면 _BASE_RULES 대신 사용.
        tone_hint: 톤 힌트 문자열 (D-1 랜덤 톤).
        avoid_starters: 시작어 중복 방지 목록 (D-1 최근 댓글 시작어).
        category_hint: 카테고리별 힌트 (D-2).
        persona_tone: 사용자 블로그 분석 기반 페르소나. 있으면 _SYSTEM_TONE 대체.

    Returns:
        완성된 시스템 프롬프트 문자열
    """
    rules = custom_rules if custom_rules else _BASE_RULES
    parts = [persona_tone or _SYSTEM_TONE, rules]

    if category_hint:
        parts.append(f"\n카테고리 힌트: {category_hint}")

    if tone_hint:
        parts.append(f"\n톤 힌트: {tone_hint}")

    if avoid_starters:
        starters_str = ", ".join(f'"{s}"' for s in avoid_starters)
        parts.append(
            f"\n시작어 금지: 아래 단어로 댓글을 시작하지 마. ({starters_str})"
        )

    return "\n".join(parts)


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


def _check_ollama() -> bool:
    """Ollama 서버 연결 가능 여부 확인 (결과 캐시)."""
    global _ollama_available
    if _ollama_available is not None:
        return _ollama_available
    try:
        req = urllib.request.Request(f"{_OLLAMA_URL}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            _ollama_available = resp.status == 200
    except Exception:
        _ollama_available = False
    if _ollama_available:
        logger.info(f"Ollama 사용 가능 (모델: {_OLLAMA_MODEL})")
    return _ollama_available


def _call_ollama(system: str, user_msg: str, max_tokens: int = 300) -> str | None:
    """Ollama API로 텍스트 생성. 실패 시 None."""
    if not _check_ollama():
        return None
    try:
        payload = json.dumps({
            "model": _OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            "stream": False,
            "options": {"num_predict": max_tokens, "temperature": 0.8},
        }).encode()
        req = urllib.request.Request(
            f"{_OLLAMA_URL}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            return data.get("message", {}).get("content", "").strip()
    except Exception as e:
        logger.warning(f"Ollama 호출 실패: {e}")
        return None


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


def _extract_starters(comments: list[str], count: int = 5) -> list[str]:
    """
    최근 댓글 목록에서 시작어(첫 단어 또는 첫 2~3자) 추출.
    최대 count개 댓글에서 중복 제거 후 반환.
    """
    starters = []
    seen: set[str] = set()
    for comment in comments[-count:]:
        stripped = comment.strip()
        if not stripped:
            continue
        # 첫 토큰: 공백/줄바꿈 기준으로 분리, 최대 4자
        first_token = stripped.split()[0] if stripped.split() else stripped[:4]
        token = first_token[:4]
        if token and token not in seen:
            seen.add(token)
            starters.append(token)
    return starters


def generate_comment(
    post_text: str,
    post_title: str,
    recent_comments: list[str] | None = None,
    custom_prompt: str | None = None,
    persona_tone: str | None = None,
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
    # 카테고리 감지 (D-2)
    category = _detect_category(post_title, post_text)

    # 본문이 비거나 너무 짧으면 폰백
    body = post_text.strip()
    if len(body) < 20:
        logger.debug("본문 너무 짧음 — phrases 폰백")
        return pick_phrase(post_title, category=category)

    # 본문 길이 제한 (토큰 절약)
    if len(body) > _MAX_BODY_CHARS:
        body = body[:_MAX_BODY_CHARS] + "…"

    recent_comments = recent_comments or []

    # D-1: 톤 랜덤화
    _, tone_hint = _pick_tone()

    # D-1: 시작어 중복 방지 (최근 5개 댓글의 시작어 추출)
    avoid_starters = _extract_starters(recent_comments, count=5)

    # D-2: 카테고리 힌트
    category_hint = _CATEGORY_PROMPT_HINTS.get(category) if category else None

    # ── 1차: Ollama 우선 시도 (크레딧 불필요) ──
    ollama_comment = _try_ollama_comment(body, post_title, tone_hint, category_hint, persona_tone)
    if ollama_comment and len(ollama_comment) >= 100 and _is_valid_comment(ollama_comment):
        if not any(_is_similar(ollama_comment, rc) for rc in recent_comments):
            comment = post_process(_clean_comment(ollama_comment))
            logger.info(f"Ollama 댓글 생성 완료 ({len(comment)}자): {comment[:40]}...")
            return comment

    # ── 2차: Anthropic API 시도 ──
    client = _get_client()
    if client is not None:
        for attempt in range(3):
            try:
                system_prompt = _build_system_prompt(
                    custom_rules=custom_prompt,
                    tone_hint=tone_hint,
                    avoid_starters=avoid_starters,
                    category_hint=category_hint,
                    persona_tone=persona_tone,
                )
                user_message = (
                    f"[제목] {post_title}\n\n[본문]\n{body}\n\n"
                    "위 게시물에 3줄 이상, 120자 이상의 댓글을 작성해.\n"
                    "예시: 와 여기 분위기 진짜 좋네요! 사진 보니까 바로 가고 싶어졌어요 ㅎㅎ\\n"
                    "가격도 합리적이고 메뉴도 다양해서 선택 장애 올 것 같아요\\n"
                    "다음에 친구들이랑 꼭 가봐야겠어요 좋은 정보 감사합니다 ❤️"
                )

                response = client.messages.create(
                    model=COMMENT_AI_MODEL,
                    max_tokens=300,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_message}],
                )
                comment = response.content[0].text.strip()

                if len(comment) < 100:
                    logger.warning(f"AI 응답 너무 짧음 ({len(comment)}자, 시도 {attempt + 1}/3)")
                    continue

                if comment.startswith('"') and comment.endswith('"'):
                    comment = comment[1:-1]
                if len(comment) > 300:
                    comment = comment[:297] + "..."

                if not _is_valid_comment(comment):
                    continue

                if any(_is_similar(comment, rc) for rc in recent_comments):
                    _, tone_hint = _pick_tone()
                    continue

                comment = post_process(comment)
                logger.info(f"AI 댓글 생성 완료 ({len(comment)}자): {comment[:40]}...")
                return comment

            except Exception as e:
                logger.warning(f"AI 댓글 생성 오류 (시도 {attempt + 1}/3): {e}")
                continue

    # ── 3차: phrases 폰백 ──
    logger.warning("Ollama+Anthropic 모두 실패 — phrases 폰백")
    return pick_phrase(post_title, category=category)


def _clean_comment(comment: str) -> str:
    """댓글 후처리: 따옴표 제거 + 길이 제한."""
    if comment.startswith('"') and comment.endswith('"'):
        comment = comment[1:-1]
    if len(comment) > 300:
        comment = comment[:297] + "..."
    return comment


def _try_ollama_comment(
    body: str,
    title: str,
    tone_hint: str | None = None,
    category_hint: str | None = None,
    persona_tone: str | None = None,
) -> str | None:
    """Ollama로 단건 댓글 생성 시도. 실패 시 None."""
    system = _SYSTEM_TONE
    if persona_tone:
        system += f"\n\n페르소나 말투: {persona_tone}"
    if tone_hint:
        system += f"\n\n{tone_hint}"
    if category_hint:
        system += f"\n\n{category_hint}"
    system += f"\n\n{_BASE_RULES}"

    user_msg = (
        f"[제목] {title}\n\n[본문]\n{body}\n\n"
        "위 게시물에 3줄 이상, 120자 이상의 공감 댓글을 작성해. 댓글 텍스트만 출력."
    )
    result = _call_ollama(system, user_msg, max_tokens=300)
    if result:
        # \\n 리터럴 → 실제 줄바꿈
        result = result.replace("\\n", "\n")
    return result


def _parse_batch_response(text: str, count: int) -> list[str]:
    """
    배치 응답 파싱. '1: 댓글내용' 또는 '1. 댓글내용' 형식.
    댓글 내 \\n은 실제 줄바꿈으로 변환.
    """
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
                        # \n 리터럴을 실제 줄바꿈으로 변환
                        comment = comment.replace("\\n", "\n")
                        comments[idx] = comment
                        break
                except (ValueError, IndexError):
                    continue
    return [comments.get(i, "") for i in range(1, count + 1)]


def generate_comments_batch(
    posts: list[dict],
    recent_comments: list[str] | None = None,
    custom_prompt: str | None = None,
    persona_tone: str | None = None,
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

    recent_comments_local = list(recent_comments or [])

    # 1건이면 기존 단건 함수 위임
    if len(posts) == 1:
        comment = generate_comment(
            posts[0]["body"], posts[0]["title"], recent_comments_local,
            custom_prompt=custom_prompt,
            persona_tone=persona_tone,
        )
        return [comment]

    # 배치 전체의 카테고리는 첫 번째 유효 게시물 기준으로 감지 (대표값)
    first_title = posts[0].get("title", "")
    first_body = posts[0].get("body", "")
    category = _detect_category(first_title, first_body)

    # D-1: 톤 랜덤화 + 시작어 중복 방지 (배치 Ollama에서도 사용)
    _, tone_hint = _pick_tone()

    # ── 1차: Ollama로 개별 생성 (크레딧 불필요) ──
    if _check_ollama():
        results: list[str] = []
        all_ok = True
        for p in posts:
            body = p["body"].strip()
            cat = _detect_category(p.get("title", ""), body)
            cat_hint = _CATEGORY_PROMPT_HINTS.get(cat) if cat else None
            if len(body) >= 20:
                ollama_comment = _try_ollama_comment(
                    body[:_MAX_BODY_CHARS], p["title"],
                    tone_hint=tone_hint, category_hint=cat_hint,
                    persona_tone=persona_tone,
                )
                if ollama_comment and len(ollama_comment) >= 100 and _is_valid_comment(ollama_comment):
                    comment = post_process(_clean_comment(ollama_comment))
                    results.append(comment)
                    recent_comments_local.append(comment)
                    continue
            all_ok = False
            results.append(pick_phrase(p["title"], category=cat))
        if all_ok or any(len(r) >= 100 for r in results):
            logger.info(f"Ollama 배치 생성: {sum(1 for r in results if len(r) >= 100)}개 성공")
            return results

    # ── 2차: Anthropic API 배치 ──
    client = _get_client()
    if client is None:
        return [pick_phrase(p["title"], category=_detect_category(p.get("title", ""), p.get("body", ""))) for p in posts]

    # 유효한 게시물만 배치 대상으로 분류
    valid_indices: list[int] = []
    for i, post in enumerate(posts):
        body = post["body"].strip()
        if len(body) >= 20:
            valid_indices.append(i)

    if not valid_indices:
        return [pick_phrase(p["title"], category=_detect_category(p.get("title", ""), p.get("body", ""))) for p in posts]

    # D-1: 톤 랜덤화 + 시작어 중복 방지
    _, tone_hint = _pick_tone()
    avoid_starters = _extract_starters(recent_comments_local, count=5)

    # D-2: 배치 대표 카테고리 힌트
    category_hint = _CATEGORY_PROMPT_HINTS.get(category) if category else None

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
        "각 댓글은 본문 속 정보 2~3가지를 활용해 3~5줄(120~180자)로 작성.\n"
        "⚠️ 한 줄짜리 짧은 댓글 절대 금지. 반드시 줄바꿈(\\n)으로 나눠서 3줄 이상.\n"
        "120자 미만인 댓글은 실패 처리되므로 반드시 120자 이상 작성.\n"
        "서로 다른 표현을 써서 다양하게.\n"
        "출력 형식 (번호: 댓글, 줄바꿈은 \\n으로):\n"
        "1: 와 20% 할인 받으셨군요! 평일 가면 더 여유롭겠다 ㅎㅎ\\n사진 보니까 분위기도 너무 좋고 인테리어가 감성적이에요\\n다음에 꼭 한번 가봐야겠어요 좋은 정보 감사합니다 ❤️\n"
        "2: 크림소스 파스타 진짜 맛있어 보여요 비주얼부터 압도적이네요\\n가격도 1만원대면 가성비도 괜찮고 분위기까지 좋다니\\n주말에 친구랑 같이 가봐야겠어요 감사합니다! ㅎㅎ"
    )

    for attempt in range(2):
        try:
            system_prompt = _build_system_prompt(
                custom_rules=custom_prompt,
                tone_hint=tone_hint,
                avoid_starters=avoid_starters,
                category_hint=category_hint,
                persona_tone=persona_tone,
            )
            response = client.messages.create(
                model=COMMENT_AI_MODEL,
                max_tokens=800,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            result_text = response.content[0].text.strip()
            parsed = _parse_batch_response(result_text, len(valid_indices))

            # 결과를 원래 인덱스에 매핑
            results: list[str] = [
                pick_phrase(p["title"], category=_detect_category(p.get("title", ""), p.get("body", "")))
                for p in posts
            ]
            for seq, i in enumerate(valid_indices):
                raw = parsed[seq]
                if raw and _is_valid_comment(raw):
                    comment = _clean_comment(raw)
                    # 최소 글자수 체크 (단건과 동일 기준)
                    if len(comment) < 100:
                        logger.warning(f"배치 댓글 너무 짧음 ({len(comment)}자) — 단건 재시도 예정")
                        continue
                    if not any(_is_similar(comment, rc) for rc in recent_comments_local):
                        # D-3: 후처리 적용
                        comment = post_process(comment)
                        results[i] = comment
                        recent_comments_local.append(comment)

            # 배치에서 짧거나 실패한 댓글은 단건으로 재시도
            fallback_category = None
            for seq, i in enumerate(valid_indices):
                fallback_category = _detect_category(posts[i].get("title", ""), posts[i].get("body", ""))
                if results[i] == pick_phrase(posts[i]["title"], category=fallback_category):
                    retry_comment = generate_comment(
                        posts[i]["body"], posts[i]["title"],
                        recent_comments_local, custom_prompt=custom_prompt,
                        persona_tone=persona_tone,
                    )
                    if len(retry_comment) >= 100:
                        results[i] = retry_comment
                        recent_comments_local.append(retry_comment)
                        logger.info(f"배치 실패 → 단건 재시도 성공 ({len(retry_comment)}자)")

            logger.info(
                f"배치 댓글 생성 완료: {len(valid_indices)}개 요청, "
                f"{sum(1 for seq, i in enumerate(valid_indices) if results[i] != pick_phrase(posts[i]['title']))}개 AI 생성"
            )
            return results

        except Exception as e:
            logger.warning(f"배치 댓글 생성 오류 (시도 {attempt + 1}/2): {e}")
            continue

    # 배치 실패 → Ollama로 개별 생성 시도
    logger.warning("배치 댓글 생성 실패 — Ollama 폴백 시도")
    results: list[str] = []
    for p in posts:
        body = p["body"].strip()
        cat = _detect_category(p.get("title", ""), body)
        cat_hint = _CATEGORY_PROMPT_HINTS.get(cat) if cat else None
        if len(body) >= 20:
            ollama_comment = _try_ollama_comment(
                body[:_MAX_BODY_CHARS], p["title"],
                tone_hint=tone_hint, category_hint=cat_hint,
                persona_tone=persona_tone,
            )
            if ollama_comment and len(ollama_comment) >= 100 and _is_valid_comment(ollama_comment):
                comment = post_process(_clean_comment(ollama_comment))
                logger.info(f"Ollama 배치 폴백 성공 ({len(comment)}자)")
                results.append(comment)
                continue
        results.append(pick_phrase(p["title"], category=cat))

    return results

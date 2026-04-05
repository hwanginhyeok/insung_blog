"""
persona_items → 용도별(글쓰기/댓글/대댓글) 톤 프롬프트 빌더

user_personas (is_default=True, crawl_status='done') + persona_items를
읽어서 용도에 맞는 프롬프트를 반환한다.

용도별 카테고리 매핑:
  - writing (글쓰기): 모든 카테고리
  - comment (댓글): voice, emoji, ending, forbidden, custom (닉네임 항목 제거)
  - reply (대댓글): voice, emoji, ending, forbidden, custom (닉네임 유지)

사용:
    from src.persona.persona_builder import load_persona_prompt
    tone = load_persona_prompt(user_id, "comment")  # 댓글용
    tone = load_persona_prompt(user_id, "reply")     # 대댓글용
"""
import re

from src.utils.logger import logger


# 용도별 카테고리 매핑
_WRITING_CATEGORIES = {"voice", "emoji", "structure", "ending", "forbidden", "custom", "formatting"}
_COMMENT_CATEGORIES = {"voice", "emoji", "ending", "forbidden", "custom"}
_REPLY_CATEGORIES = {"voice", "emoji", "ending", "forbidden", "custom"}

_PURPOSE_CATEGORIES = {
    "writing": _WRITING_CATEGORIES,
    "comment": _COMMENT_CATEGORIES,
    "reply": _REPLY_CATEGORIES,
}

_CATEGORY_LABELS = {
    "voice": "말투와 어미",
    "emoji": "이모지/이모티콘",
    "structure": "글 구조",
    "ending": "마무리 표현",
    "forbidden": "금지 표현",
    "custom": "특유 표현",
    "formatting": "포맷팅",
    "category_prompt": "카테고리 프롬프트",
}

# 닉네임/자기소개 관련 항목 감지 패턴
_NICKNAME_PATTERNS = [
    re.compile(r"자칭", re.IGNORECASE),
    re.compile(r"지칭", re.IGNORECASE),
    re.compile(r"닉네임", re.IGNORECASE),
    re.compile(r"3인칭", re.IGNORECASE),
    re.compile(r"시작.*도입", re.IGNORECASE),
    re.compile(r"도입부", re.IGNORECASE),
    re.compile(r"후기입니다", re.IGNORECASE),
]

# 용도별 서두 프롬프트
_PURPOSE_HEADERS = {
    "writing": "너는 다음 스타일로 블로그 글을 쓰는 사람이야.",
    "comment": (
        "너는 다음 말투 스타일을 참고해서 댓글을 쓰는 사람이야.\n"
        "절대 금지: 자신의 닉네임/이름/블로그명을 댓글에 넣지 말 것. "
        "'유유베어가', '~가 다녀온' 같은 3인칭 서술 금지."
    ),
    "reply": "너는 다음 말투 스타일의 블로그 주인이야. 방문자 댓글에 따뜻하게 답글을 달아.",
}

# 카테고리 출력 순서
_CATEGORY_ORDER = ["voice", "emoji", "structure", "ending", "custom", "forbidden", "formatting", "category_prompt"]


def _is_nickname_item(value: str) -> bool:
    """항목 값이 닉네임/자기소개 관련인지 감지."""
    for pattern in _NICKNAME_PATTERNS:
        if pattern.search(value):
            return True
    return False


def _build_prompt(items: list[dict], purpose: str) -> str | None:
    """
    persona_items 목록 → 용도별 톤 프롬프트 문자열.

    Args:
        items: persona_items 레코드 목록
        purpose: "writing", "comment", "reply"

    Returns:
        프롬프트 문자열 (없거나 빈 경우 None)
    """
    allowed_categories = _PURPOSE_CATEGORIES.get(purpose, _COMMENT_CATEGORIES)
    strip_nickname = (purpose == "comment")

    # 활성화된 해당 용도 카테고리 항목만 필터링
    active_items = [
        item for item in items
        if item.get("is_active", True) and item.get("category") in allowed_categories
    ]
    if not active_items:
        return None

    # 댓글용이면 닉네임 관련 항목 제거
    if strip_nickname:
        active_items = [
            item for item in active_items
            if not _is_nickname_item(item.get("value", ""))
        ]
        if not active_items:
            return None

    active_items.sort(key=lambda x: x.get("priority", 1), reverse=True)

    # 카테고리별 그룹핑
    by_category: dict[str, list[str]] = {}
    for item in active_items:
        cat = item["category"]
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(item["value"])

    # 프롬프트 조합
    header = _PURPOSE_HEADERS.get(purpose, _PURPOSE_HEADERS["comment"])
    lines = [header]

    for cat in _CATEGORY_ORDER:
        if cat not in by_category:
            continue
        label = _CATEGORY_LABELS.get(cat, cat)
        lines.append(f"\n[{label}]")
        for val in by_category[cat][:5]:  # 카테고리당 최대 5개
            lines.append(f"- {val}")

    result = "\n".join(lines)
    return result if len(result) > 30 else None


def build_writing_prompt(items: list[dict]) -> str | None:
    """글쓰기용 페르소나 프롬프트 빌드. 모든 카테고리, 닉네임 유지."""
    return _build_prompt(items, "writing")


def build_comment_prompt(items: list[dict]) -> str | None:
    """댓글용 페르소나 프롬프트 빌드. 닉네임 항목 제거, structure/formatting 제외."""
    return _build_prompt(items, "comment")


def build_reply_prompt(items: list[dict]) -> str | None:
    """대댓글용 페르소나 프롬프트 빌드. 닉네임 유지, structure/formatting 제외."""
    return _build_prompt(items, "reply")


# 하위 호환용 (기존 코드에서 사용)
def build_persona_prompt(items: list[dict]) -> str | None:
    """하위 호환: 댓글용으로 빌드."""
    return build_comment_prompt(items)


def _load_persona_items(user_id: str) -> list[dict] | None:
    """Supabase에서 사용자의 기본 페르소나 항목 로드."""
    try:
        from src.storage.supabase_client import get_supabase
        sb = get_supabase()

        # 기본 페르소나 조회 (is_default=True, crawl_status='done')
        persona_result = (
            sb.table("user_personas")
            .select("id")
            .eq("user_id", user_id)
            .eq("is_default", True)
            .eq("crawl_status", "done")
            .limit(1)
            .execute()
        )
        if not persona_result.data:
            logger.debug(f"사용자 {user_id[:8]} 기본 페르소나 없음 (기본 톤 사용)")
            return None

        persona_id = persona_result.data[0]["id"]

        # 페르소나 항목 조회
        items_result = (
            sb.table("persona_items")
            .select("category, key, value, priority, is_active")
            .eq("persona_id", persona_id)
            .eq("is_active", True)
            .execute()
        )
        if not items_result.data:
            logger.debug(f"페르소나 {persona_id[:8]} 항목 없음")
            return None

        return items_result.data

    except Exception as e:
        logger.warning(f"페르소나 로드 실패 (기본 톤 사용): {e}")
        return None


def load_persona_prompt(user_id: str, purpose: str = "comment") -> str | None:
    """
    Supabase에서 사용자의 기본 페르소나 항목을 로드 → 용도별 프롬프트 빌드.

    Args:
        user_id: 사용자 ID
        purpose: "writing", "comment", "reply"

    Returns:
        페르소나 프롬프트 문자열, 없거나 실패 시 None
    """
    items = _load_persona_items(user_id)
    if not items:
        return None

    prompt = _build_prompt(items, purpose)
    if prompt:
        logger.info(f"페르소나 프롬프트 로드 완료 (용도={purpose}, {len(prompt)}자)")
    return prompt


def load_default_persona_prompt(user_id: str) -> str | None:
    """하위 호환: 댓글용 프롬프트 로드."""
    return load_persona_prompt(user_id, "comment")

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


# Phase 2 (2026-04-11): 'all' 페르소나 제거 + 활성 슬롯 기반 빌드
# ┌────────────────────────────────────────────────────────────────┐
# │ load_persona_prompt(user_id, purpose) 흐름                      │
# │                                                                  │
# │  1. bot_settings.active_{purpose}_persona_id 조회               │
# │     ├─ 있음 → 그 페르소나 items로 빌드                          │
# │     └─ 없음 → 시스템 기본 페르소나(is_system=true) fallback    │
# │                                                                  │
# │  2. 페르소나 → persona_items SELECT (is_active=true)            │
# │  3. _build_prompt(items, purpose) → 용도별 프롬프트 문자열      │
# │                                                                  │
# │  Phase 1 호환성: 'all' 페르소나는 마이그레이션에서 제거됨       │
# │  → writing/comment/reply 분기 폴백 로직 없음                    │
# └────────────────────────────────────────────────────────────────┘

def _load_active_persona_id(user_id: str, purpose: str) -> str | None:
    """bot_settings.active_{purpose}_persona_id 조회."""
    try:
        from src.storage.supabase_client import get_supabase
        sb = get_supabase()

        slot_column = f"active_{purpose}_persona_id"
        result = (
            sb.table("bot_settings")
            .select(slot_column)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0].get(slot_column)
    except Exception as e:
        logger.warning(f"활성 페르소나 슬롯 조회 실패: {e}")
        return None


def _load_system_fallback_persona_id(purpose: str) -> str | None:
    """시스템 기본 페르소나 ID 조회 (활성 슬롯이 NULL일 때 fallback)."""
    try:
        from src.storage.supabase_client import get_supabase
        sb = get_supabase()

        # 시스템 페르소나 중 purpose 일치 + 첫 번째 (writing은 카테고리 무관 첫 번째 = 맛집)
        result = (
            sb.table("user_personas")
            .select("id")
            .eq("is_system", True)
            .eq("purpose", purpose)
            .order("created_at", desc=False)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0]["id"]
    except Exception as e:
        logger.warning(f"시스템 페르소나 fallback 조회 실패: {e}")
        return None


def _load_persona_items_by_id(persona_id: str) -> list[dict] | None:
    """페르소나 ID로 활성 항목 SELECT."""
    try:
        from src.storage.supabase_client import get_supabase
        sb = get_supabase()

        result = (
            sb.table("persona_items")
            .select("category, key, value, priority, is_active")
            .eq("persona_id", persona_id)
            .eq("is_active", True)
            .execute()
        )
        return result.data if result.data else None
    except Exception as e:
        logger.warning(f"페르소나 항목 조회 실패: {e}")
        return None


def load_persona_prompt(user_id: str, purpose: str = "comment") -> str | None:
    """
    사용자의 활성 페르소나(용도별)를 로드 → 용도별 프롬프트 빌드.

    Phase 2 흐름:
      1. bot_settings.active_{purpose}_persona_id 조회
      2. NULL이면 시스템 기본 페르소나(is_system=true, purpose 일치)로 fallback
      3. 페르소나 items 로드 → 프롬프트 빌드

    Args:
        user_id: 사용자 ID
        purpose: "writing", "comment", "reply"

    Returns:
        페르소나 프롬프트 문자열, 없거나 실패 시 None (호출자가 기본 톤 사용)
    """
    if purpose not in ("writing", "comment", "reply"):
        logger.warning(f"알 수 없는 purpose: {purpose}")
        return None

    # 1. 활성 슬롯 조회
    persona_id = _load_active_persona_id(user_id, purpose)

    # 2. 비어있으면 시스템 기본 페르소나로 fallback
    if not persona_id:
        persona_id = _load_system_fallback_persona_id(purpose)
        if not persona_id:
            logger.debug(f"사용자 {user_id[:8]} {purpose} 활성 페르소나 없음 + 시스템 기본도 없음")
            return None
        logger.debug(f"사용자 {user_id[:8]} {purpose} 활성 슬롯 비어있음 → 시스템 기본 fallback")

    # 3. 항목 로드 + 프롬프트 빌드
    items = _load_persona_items_by_id(persona_id)
    if not items:
        return None

    prompt = _build_prompt(items, purpose)
    if prompt:
        logger.info(f"페르소나 프롬프트 로드 완료 (용도={purpose}, {len(prompt)}자)")
    return prompt


def load_default_persona_prompt(user_id: str) -> str | None:
    """하위 호환: 댓글용 프롬프트 로드."""
    return load_persona_prompt(user_id, "comment")

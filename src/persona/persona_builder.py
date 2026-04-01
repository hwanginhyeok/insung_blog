"""
persona_items → 댓글 생성용 톤 프롬프트 빌더

user_personas (is_default=True, crawl_status='done') + persona_items를
읽어서 _SYSTEM_TONE을 대체할 문자열을 반환한다.

사용:
    from src.persona.persona_builder import load_default_persona_prompt
    tone = load_default_persona_prompt(user_id)  # None이면 기본값 사용
"""
from src.utils.logger import logger


# 댓글 생성에 유효한 카테고리 (formatting은 블로그 포스트용)
_COMMENT_CATEGORIES = {"voice", "emoji", "ending", "forbidden", "custom"}

_CATEGORY_LABELS = {
    "voice": "말투와 어미",
    "emoji": "이모지/이모티콘",
    "ending": "마무리 표현",
    "forbidden": "금지 표현",
    "custom": "특유 표현",
}


def build_persona_prompt(items: list[dict]) -> str | None:
    """
    persona_items 목록 → 댓글 생성용 톤 프롬프트 문자열.

    Args:
        items: persona_items 레코드 목록 (category, key, value, priority, is_active)

    Returns:
        프롬프트 문자열 (없거나 빈 경우 None)
    """
    # 활성화된 댓글 관련 항목만 필터링, priority 내림차순 정렬
    active_items = [
        item for item in items
        if item.get("is_active", True) and item.get("category") in _COMMENT_CATEGORIES
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
    lines = ["너는 다음 스타일로 댓글을 쓰는 사람이야."]

    for cat in ["voice", "emoji", "ending", "custom", "forbidden"]:
        if cat not in by_category:
            continue
        label = _CATEGORY_LABELS[cat]
        lines.append(f"\n[{label}]")
        for val in by_category[cat][:5]:  # 카테고리당 최대 5개
            lines.append(f"- {val}")

    result = "\n".join(lines)
    return result if len(result) > 30 else None


def load_default_persona_prompt(user_id: str) -> str | None:
    """
    Supabase에서 사용자의 기본 페르소나 항목을 로드 → 프롬프트 빌드.

    Returns:
        페르소나 프롬프트 문자열, 없거나 실패 시 None
    """
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

        prompt = build_persona_prompt(items_result.data)
        if prompt:
            logger.info(f"페르소나 프롬프트 로드 완료 ({len(prompt)}자)")
        return prompt

    except Exception as e:
        logger.warning(f"페르소나 로드 실패 (기본 톤 사용): {e}")
        return None

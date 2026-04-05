"""
교류 기록 저장 — 댓글 작성/수신, 방문 이력을 Supabase에 기록.

댓글 작성 시 orchestrator/comment_writer에서 호출하여 교류 기록을 남긴다.
"""
from datetime import datetime, timezone

from src.storage.supabase_client import get_supabase, _resolve_user_id
from src.utils.logger import setup_logger

logger = setup_logger("interaction_tracker")


def record_interaction(
    blog_id: str,
    interaction_type: str,
    post_url: str | None = None,
    content: str | None = None,
    user_id: str | None = None,
) -> bool:
    """
    이웃 교류 기록 저장.

    Args:
        blog_id: 대상 블로그 ID
        interaction_type: 'comment_sent' | 'comment_received' | 'visit' | 'reply_sent'
        post_url: 관련 게시물 URL
        content: 댓글 내용 등
        user_id: 사용자 ID (None이면 admin 폴백)

    Returns:
        저장 성공 여부
    """
    try:
        uid = _resolve_user_id(user_id)
        sb = get_supabase()

        sb.table("neighbor_interactions").insert({
            "user_id": uid,
            "blog_id": blog_id,
            "interaction_type": interaction_type,
            "post_url": post_url,
            "content": (content[:500] if content else None),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        logger.debug(f"교류 기록 저장: {blog_id} ({interaction_type})")
        return True
    except Exception as e:
        logger.warning(f"교류 기록 저장 실패: {e}")
        return False


def get_recent_interactions(
    blog_id: str,
    user_id: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """특정 블로거와의 최근 교류 기록 조회."""
    try:
        uid = _resolve_user_id(user_id)
        sb = get_supabase()

        result = (
            sb.table("neighbor_interactions")
            .select("*")
            .eq("user_id", uid)
            .eq("blog_id", blog_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.warning(f"교류 기록 조회 실패: {e}")
        return []


def get_interaction_stats(
    user_id: str | None = None,
) -> dict:
    """전체 교류 통계 조회."""
    try:
        uid = _resolve_user_id(user_id)
        sb = get_supabase()

        # 최근 30일 교류 수 (간단 집계)
        result = (
            sb.table("neighbor_interactions")
            .select("interaction_type", count="exact")
            .eq("user_id", uid)
            .execute()
        )

        total = result.count or 0
        type_counts: dict[str, int] = {}
        for row in (result.data or []):
            t = row.get("interaction_type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1

        return {
            "total": total,
            "by_type": type_counts,
        }
    except Exception as e:
        logger.warning(f"교류 통계 조회 실패: {e}")
        return {"total": 0, "by_type": {}}

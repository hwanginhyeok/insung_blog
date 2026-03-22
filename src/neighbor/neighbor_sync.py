"""
이웃 목록 Supabase 동기화 — neighbors 테이블 CRUD + 주기적 동기화.

orchestrator 또는 워커에서 이웃 확인 후 결과를 저장한다.
주기적 동기화: 네이버 이웃 상태를 확인하여 DB에 반영.
"""
from datetime import datetime, timezone

from src.storage.supabase_client import get_supabase, _resolve_user_id
from src.utils.logger import setup_logger

logger = setup_logger("neighbor_sync")


def upsert_neighbor(
    blog_id: str,
    blog_name: str | None = None,
    neighbor_type: str | None = None,
    category: str | None = None,
    user_id: str | None = None,
) -> bool:
    """이웃 정보 저장/업데이트 (upsert)."""
    try:
        uid = _resolve_user_id(user_id)
        sb = get_supabase()

        data: dict = {
            "user_id": uid,
            "blog_id": blog_id,
        }
        if blog_name is not None:
            data["blog_name"] = blog_name
        if neighbor_type is not None:
            data["neighbor_type"] = neighbor_type
        if category is not None:
            data["category"] = category

        sb.table("neighbors").upsert(
            data, on_conflict="user_id,blog_id"
        ).execute()

        logger.debug(f"이웃 정보 동기화: {blog_id} ({neighbor_type})")
        return True
    except Exception as e:
        logger.warning(f"이웃 정보 동기화 실패 ({blog_id}): {e}")
        return False


def update_last_interaction(
    blog_id: str,
    user_id: str | None = None,
) -> None:
    """이웃의 마지막 교류 시간 업데이트."""
    try:
        uid = _resolve_user_id(user_id)
        sb = get_supabase()

        sb.table("neighbors").update({
            "last_interaction_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", uid).eq("blog_id", blog_id).execute()
    except Exception as e:
        logger.debug(f"마지막 교류 시간 업데이트 실패: {e}")


def get_neighbors(
    user_id: str | None = None,
    neighbor_type: str | None = None,
) -> list[dict]:
    """이웃 목록 조회."""
    try:
        uid = _resolve_user_id(user_id)
        sb = get_supabase()

        query = (
            sb.table("neighbors")
            .select("*")
            .eq("user_id", uid)
            .order("created_at", desc=True)
        )
        if neighbor_type:
            query = query.eq("neighbor_type", neighbor_type)

        result = query.execute()
        return result.data or []
    except Exception as e:
        logger.warning(f"이웃 목록 조회 실패: {e}")
        return []


def get_neighbor_stats(user_id: str | None = None) -> dict:
    """이웃 통계 (타입별 수)."""
    try:
        uid = _resolve_user_id(user_id)
        sb = get_supabase()

        result = (
            sb.table("neighbors")
            .select("neighbor_type")
            .eq("user_id", uid)
            .execute()
        )

        stats = {"mutual": 0, "one_way_following": 0, "one_way_follower": 0, "total": 0}
        for row in (result.data or []):
            t = row.get("neighbor_type", "")
            if t in stats:
                stats[t] += 1
            stats["total"] += 1

        return stats
    except Exception as e:
        logger.warning(f"이웃 통계 조회 실패: {e}")
        return {"mutual": 0, "one_way_following": 0, "one_way_follower": 0, "total": 0}


def save_neighbor_request(
    target_blog_id: str,
    target_blog_name: str | None = None,
    message: str | None = None,
    status: str = "sent",
    user_id: str | None = None,
) -> bool:
    """서로이웃 신청 이력 저장."""
    try:
        uid = _resolve_user_id(user_id)
        sb = get_supabase()

        sb.table("neighbor_requests").insert({
            "user_id": uid,
            "target_blog_id": target_blog_id,
            "target_blog_name": target_blog_name,
            "status": status,
            "message": message,
            "requested_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        logger.info(f"서로이웃 신청 이력 저장: {target_blog_id} ({status})")
        return True
    except Exception as e:
        logger.warning(f"신청 이력 저장 실패: {e}")
        return False


def get_neighbor_requests(
    user_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """서로이웃 신청 이력 조회."""
    try:
        uid = _resolve_user_id(user_id)
        sb = get_supabase()

        query = (
            sb.table("neighbor_requests")
            .select("*")
            .eq("user_id", uid)
            .order("requested_at", desc=True)
            .limit(limit)
        )
        if status:
            query = query.eq("status", status)

        result = query.execute()
        return result.data or []
    except Exception as e:
        logger.warning(f"신청 이력 조회 실패: {e}")
        return []


async def sync_neighbor_statuses(
    page,
    user_id: str | None = None,
    limit: int = 20,
) -> dict:
    """
    이웃 상태 주기적 동기화.

    DB의 이웃 목록에서 최근 미확인 이웃을 브라우저로 방문하여
    현재 이웃 상태(서로이웃/일방/해제)를 업데이트한다.

    Args:
        page: Playwright 페이지 인스턴스
        user_id: 대상 사용자
        limit: 한 번에 확인할 이웃 수

    Returns:
        { checked: int, updated: int, message: str }
    """
    from src.neighbor.neighbor_checker import check_neighbor_status

    uid = _resolve_user_id(user_id)
    sb = get_supabase()

    # 가장 오래된 last_interaction_at 기준으로 확인 대상 선정
    result = (
        sb.table("neighbors")
        .select("blog_id, blog_name, neighbor_type")
        .eq("user_id", uid)
        .order("last_interaction_at", desc=False, nullsfirst=True)
        .limit(limit)
        .execute()
    )

    neighbors = result.data or []
    if not neighbors:
        return {"checked": 0, "updated": 0, "message": "확인할 이웃 없음"}

    checked = 0
    updated = 0

    for n in neighbors:
        try:
            current_status = await check_neighbor_status(page, n["blog_id"])
            checked += 1

            # 상태 변경 감지
            new_type = current_status or "one_way_following"
            if new_type != n["neighbor_type"]:
                upsert_neighbor(
                    n["blog_id"],
                    blog_name=n.get("blog_name"),
                    neighbor_type=new_type,
                    user_id=user_id,
                )
                updated += 1
                logger.info(
                    f"이웃 상태 변경 감지: {n['blog_id']} "
                    f"({n['neighbor_type']} → {new_type})"
                )
        except Exception as e:
            logger.debug(f"이웃 상태 확인 실패 ({n['blog_id']}): {e}")

    logger.info(f"이웃 상태 동기화: {checked}건 확인, {updated}건 변경")
    return {
        "checked": checked,
        "updated": updated,
        "message": f"{checked}건 확인, {updated}건 변경",
    }

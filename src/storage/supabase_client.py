"""
Supabase 클라이언트 — 텔레그램 봇/API 서버에서 공용 DB 접근용.

service_role 키 사용 (RLS 우회). 서버 사이드 전용.

기능:
  1. generation_queue 저장 (텔레그램→웹 공유)
  2. pending_comments CRUD (댓글 승인/거부 — 웹·텔레그램 공유)
  3. bot_settings 조회/수정 (봇 설정)
  4. bot_run_log 기록/조회 (실행 이력)
"""

import os
from datetime import datetime
from functools import lru_cache

from supabase import create_client, Client

from src.utils.logger import setup_logger

logger = setup_logger("supabase_client")

_user_id_cache: str | None = None


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Supabase 클라이언트 싱글턴 반환."""
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 .env에 없습니다"
        )

    return create_client(url, key)


def get_admin_user_id() -> str:
    """
    관리자(인성이) user_id 조회 + 캐싱.
    users 테이블에서 role='admin'인 첫 번째 사용자 반환.
    """
    global _user_id_cache
    if _user_id_cache:
        return _user_id_cache

    sb = get_supabase()
    result = sb.table("users").select("id").eq("role", "admin").limit(1).execute()

    if not result.data:
        raise RuntimeError("users 테이블에 admin 사용자가 없습니다")

    _user_id_cache = result.data[0]["id"]
    logger.info(f"관리자 user_id 캐싱: {_user_id_cache[:8]}...")
    return _user_id_cache


def save_generation(
    *,
    title: str,
    body: str,
    hashtags: list[str],
    category: str | None = None,
    memo: str | None = None,
    photo_paths: list[str] | None = None,
    html: str | None = None,
    source: str = "telegram",
) -> str | None:
    """
    generation_queue에 완료된 생성 결과 저장.
    반환: 생성된 row의 UUID (실패 시 None).
    """
    try:
        sb = get_supabase()
        user_id = get_admin_user_id()

        row = {
            "user_id": user_id,
            "input_photos": photo_paths or [],
            "input_memo": memo,
            "input_category": category,
            "status": "completed",
            "generated_title": title,
            "generated_body": body,
            "generated_html": html,
            "generated_hashtags": hashtags,
            "source": source,
        }

        result = sb.table("generation_queue").insert(row).execute()

        if result.data:
            row_id = result.data[0]["id"]
            logger.info(f"Supabase 저장 성공: {row_id[:8]}... (source={source})")
            return row_id

    except Exception as e:
        logger.error(f"Supabase 저장 실패: {e}")

    return None


# ── pending_comments (댓글 승인 관리) ─────────────────────────────────────


def add_pending_comment_sb(
    blog_id: str,
    post_url: str,
    post_title: str,
    comment_text: str,
    ai_generated: bool = True,
) -> str | None:
    """
    승인 대기 댓글 추가 (봇 → Supabase).
    반환: 생성된 row UUID (실패 시 None).
    """
    try:
        sb = get_supabase()
        user_id = get_admin_user_id()

        row = {
            "user_id": user_id,
            "blog_id": blog_id,
            "post_url": post_url,
            "post_title": post_title,
            "comment_text": comment_text,
            "ai_generated": ai_generated,
            "status": "pending",
        }

        result = sb.table("pending_comments").insert(row).execute()

        if result.data:
            row_id = result.data[0]["id"]
            logger.info(f"대기댓글 추가: {blog_id} → {row_id[:8]}...")
            return row_id

    except Exception as e:
        logger.error(f"대기댓글 추가 실패: {e}")

    return None


def get_pending_comments_sb(status: str = "pending") -> list[dict]:
    """
    승인 대기 댓글 목록 조회.
    status: pending, approved, rejected, posted, failed
    """
    try:
        sb = get_supabase()
        user_id = get_admin_user_id()

        result = (
            sb.table("pending_comments")
            .select("id, blog_id, post_url, post_title, comment_text, ai_generated, status, created_at")
            .eq("user_id", user_id)
            .eq("status", status)
            .order("created_at")
            .execute()
        )

        return result.data or []

    except Exception as e:
        logger.error(f"대기댓글 조회 실패: {e}")
        return []


def update_pending_status_sb(
    comment_id: str,
    status: str,
    decided_by: str = "telegram",
    fail_reason: str | None = None,
) -> bool:
    """
    대기 댓글 상태 변경.
    status: approved, rejected, posted, failed
    decided_by: 'web' 또는 'telegram'
    """
    try:
        sb = get_supabase()

        update_data: dict = {
            "status": status,
            "decided_by": decided_by,
            "decided_at": datetime.now().isoformat(),
        }

        if status == "posted":
            update_data["posted_at"] = datetime.now().isoformat()

        if fail_reason:
            update_data["fail_reason"] = fail_reason

        result = (
            sb.table("pending_comments")
            .update(update_data)
            .eq("id", comment_id)
            .execute()
        )

        if result.data:
            logger.info(f"대기댓글 상태 변경: {comment_id[:8]}... → {status} (by {decided_by})")
            return True

    except Exception as e:
        logger.error(f"대기댓글 상태 변경 실패: {e}")

    return False


def get_pending_count_sb() -> int:
    """현재 pending 상태 댓글 수 반환."""
    try:
        sb = get_supabase()
        user_id = get_admin_user_id()

        result = (
            sb.table("pending_comments")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("status", "pending")
            .execute()
        )

        return result.count or 0

    except Exception as e:
        logger.error(f"대기댓글 수 조회 실패: {e}")
        return 0


# ── bot_settings (봇 설정) ────────────────────────────────────────────────


_DEFAULT_SETTINGS = {
    "approval_mode": "manual",
    "is_active": True,
    "weekday_hours": {"start": 20, "end": 24},
    "weekend_hours": {"start": 13, "end": 18},
    "max_comments_per_day": 30,
    "max_bloggers_per_day": 10,
}


def get_bot_settings_sb() -> dict:
    """
    봇 설정 조회. 없으면 기본값 반환.
    반환: {approval_mode, is_active, weekday_hours, weekend_hours, max_comments_per_day, max_bloggers_per_day}
    """
    try:
        sb = get_supabase()
        user_id = get_admin_user_id()

        result = (
            sb.table("bot_settings")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if result.data:
            row = result.data[0]
            return {
                "approval_mode": row["approval_mode"],
                "is_active": row["is_active"],
                "weekday_hours": row["weekday_hours"],
                "weekend_hours": row["weekend_hours"],
                "max_comments_per_day": row["max_comments_per_day"],
                "max_bloggers_per_day": row["max_bloggers_per_day"],
            }

    except Exception as e:
        logger.error(f"봇 설정 조회 실패: {e}")

    return dict(_DEFAULT_SETTINGS)


def update_bot_settings_sb(**kwargs) -> bool:
    """
    봇 설정 변경 (upsert).
    지원 키: approval_mode, is_active, weekday_hours, weekend_hours,
            max_comments_per_day, max_bloggers_per_day
    """
    allowed_keys = {
        "approval_mode", "is_active", "weekday_hours", "weekend_hours",
        "max_comments_per_day", "max_bloggers_per_day",
    }
    update_data = {k: v for k, v in kwargs.items() if k in allowed_keys}

    if not update_data:
        logger.warning("봇 설정 변경 요청에 유효한 키 없음")
        return False

    try:
        sb = get_supabase()
        user_id = get_admin_user_id()

        update_data["user_id"] = user_id
        update_data["updated_at"] = datetime.now().isoformat()

        result = (
            sb.table("bot_settings")
            .upsert(update_data, on_conflict="user_id")
            .execute()
        )

        if result.data:
            logger.info(f"봇 설정 변경: {list(kwargs.keys())}")
            return True

    except Exception as e:
        logger.error(f"봇 설정 변경 실패: {e}")

    return False


# ── bot_run_log (실행 이력) ───────────────────────────────────────────────


def record_run_sb(
    bloggers_visited: int,
    comments_written: int,
    comments_failed: int,
    pending_count: int = 0,
    error_message: str | None = None,
    duration_seconds: int | None = None,
) -> None:
    """봇 실행 결과를 Supabase에 기록."""
    try:
        sb = get_supabase()
        user_id = get_admin_user_id()

        row = {
            "user_id": user_id,
            "bloggers_visited": bloggers_visited,
            "comments_written": comments_written,
            "comments_failed": comments_failed,
            "pending_count": pending_count,
            "error_message": error_message,
            "duration_seconds": duration_seconds,
        }

        sb.table("bot_run_log").insert(row).execute()
        logger.info(
            f"실행 이력 기록: {bloggers_visited}명 방문, "
            f"{comments_written}개 성공, {comments_failed}개 실패"
        )

    except Exception as e:
        logger.error(f"실행 이력 기록 실패: {e}")


def get_recent_runs_sb(limit: int = 10) -> list[dict]:
    """최근 실행 이력 조회."""
    try:
        sb = get_supabase()
        user_id = get_admin_user_id()

        result = (
            sb.table("bot_run_log")
            .select("id, run_at, bloggers_visited, comments_written, comments_failed, pending_count, error_message, duration_seconds")
            .eq("user_id", user_id)
            .order("run_at", desc=True)
            .limit(limit)
            .execute()
        )

        return result.data or []

    except Exception as e:
        logger.error(f"실행 이력 조회 실패: {e}")
        return []

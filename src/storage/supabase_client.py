"""
Supabase 클라이언트 — 텔레그램 봇/API 서버에서 공용 DB 접근용.

service_role 키 사용 (RLS 우회). 서버 사이드 전용.

기능:
  1. generation_queue 저장 (텔레그램→웹 공유)
  2. pending_comments CRUD (댓글 승인/거부 — 웹·텔레그램 공유)
  3. bot_settings 조회/수정 (봇 설정)
  4. bot_run_log 기록/조회 (실행 이력)
  5. 다중 사용자 지원 (user_id 파라미터 — None이면 admin 폴백)
"""

import os
from datetime import datetime, timezone
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


def get_admin_user_id() -> str | None:
    """
    관리자(인성이) user_id 조회 + 캐싱.
    users 테이블에서 role='admin'인 첫 번째 사용자 반환.
    admin이 없으면 None 반환 (크래시 방지).
    (deprecated — 새 코드는 user_id를 명시적으로 전달할 것)
    """
    global _user_id_cache
    if _user_id_cache:
        return _user_id_cache

    try:
        sb = get_supabase()
        result = sb.table("users").select("id").eq("role", "admin").limit(1).execute()

        if not result.data:
            logger.warning("users 테이블에 admin 사용자가 없습니다")
            return None

        _user_id_cache = result.data[0]["id"]
        logger.info(f"관리자 user_id 캐싱: {_user_id_cache[:8]}...")
        return _user_id_cache
    except Exception as e:
        logger.error(f"admin user_id 조회 실패: {e}")
        return None


def _resolve_user_id(user_id: str | None) -> str:
    """user_id가 None이면 admin 폴백. 하위 호환용."""
    if user_id:
        return user_id
    admin_id = get_admin_user_id()
    if not admin_id:
        raise ValueError(
            "user_id가 전달되지 않았고, admin 사용자도 조회할 수 없습니다. "
            "user_id를 명시적으로 전달하세요."
        )
    return admin_id


# ── 다중 사용자 조회 ──────────────────────────────────────────────────────


def get_active_user_ids() -> list[str]:
    """
    봇 활성 사용자 목록 조회.
    조건: is_active=True AND naver_blog_id NOT NULL
    반환: user_id 리스트
    """
    try:
        sb = get_supabase()
        result = (
            sb.table("bot_settings")
            .select("user_id")
            .eq("is_active", True)
            .not_.is_("naver_blog_id", "null")
            .execute()
        )
        user_ids = [row["user_id"] for row in (result.data or [])]
        logger.info(f"활성 사용자 {len(user_ids)}명 조회")
        return user_ids

    except Exception as e:
        logger.error(f"활성 사용자 조회 실패: {e}")
        return []


def get_user_bot_config(user_id: str) -> dict | None:
    """
    사용자의 봇 설정 + 쿠키 + blog_id를 한번에 로드.
    반환: {user_id, naver_blog_id, cookies, settings} 또는 None
    """
    try:
        sb = get_supabase()

        # 설정 조회
        settings_result = (
            sb.table("bot_settings")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not settings_result.data:
            logger.warning(f"사용자 {user_id[:8]} 봇 설정 없음")
            return None

        settings_row = settings_result.data[0]
        naver_blog_id = settings_row.get("naver_blog_id")
        if not naver_blog_id:
            logger.warning(f"사용자 {user_id[:8]} 블로그 ID 미설정")
            return None

        # 쿠키 조회
        cookies_result = (
            sb.table("bot_cookies")
            .select("cookie_data")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        cookies = None
        if cookies_result.data and cookies_result.data[0].get("cookie_data"):
            cookies = cookies_result.data[0]["cookie_data"]

        # 다중 블로그 ID: naver_blog_ids가 비어있으면 naver_blog_id로 폴백
        raw_ids = settings_row.get("naver_blog_ids") or []
        if isinstance(raw_ids, str):
            import json as _json
            try:
                raw_ids = _json.loads(raw_ids)
            except Exception:
                raw_ids = []
        naver_blog_ids = list({bid for bid in raw_ids if bid})
        if naver_blog_id and naver_blog_id not in naver_blog_ids:
            naver_blog_ids.append(naver_blog_id)

        return {
            "user_id": user_id,
            "naver_blog_id": naver_blog_id,
            "naver_blog_ids": naver_blog_ids,
            "cookies": cookies,
            "has_cookies": cookies is not None,
            "settings": {
                "approval_mode": settings_row["approval_mode"],
                "is_active": settings_row["is_active"],
                "weekday_hours": settings_row["weekday_hours"],
                "weekend_hours": settings_row["weekend_hours"],
                "max_comments_per_day": settings_row["max_comments_per_day"],
                "max_bloggers_per_day": settings_row["max_bloggers_per_day"],
                "comment_prompt": settings_row.get("comment_prompt"),
            },
        }

    except Exception as e:
        logger.error(f"사용자 {user_id[:8]} 봇 설정 로드 실패: {e}")
        return None


def add_blog_id_for_user(user_id: str, blog_id: str) -> bool:
    """
    사용자의 naver_blog_ids 배열에 블로그 ID를 추가 (중복 방지).
    naver_blog_id(대표 ID)가 비어있으면 함께 설정.
    Returns: 추가 성공 여부
    """
    if not blog_id:
        return False
    try:
        sb = get_supabase()
        result = (
            sb.table("bot_settings")
            .select("naver_blog_id, naver_blog_ids")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return False

        row = result.data[0]
        existing_ids = row.get("naver_blog_ids") or []
        if isinstance(existing_ids, str):
            import json as _json
            try:
                existing_ids = _json.loads(existing_ids)
            except Exception:
                existing_ids = []

        # 이미 존재하면 스킵
        if blog_id in existing_ids:
            return False

        # 배열에 추가
        new_ids = existing_ids + [blog_id]
        update_data: dict = {"naver_blog_ids": new_ids}

        # 대표 ID가 비어있으면 함께 설정
        if not row.get("naver_blog_id"):
            update_data["naver_blog_id"] = blog_id

        sb.table("bot_settings").update(update_data).eq("user_id", user_id).execute()
        logger.info(f"블로그 ID 추가: {blog_id} (user={user_id[:8]}, 총 {len(new_ids)}개)")
        return True
    except Exception as e:
        logger.error(f"블로그 ID 추가 실패: {e}")
        return False


# ── generation_queue ──────────────────────────────────────────────────────


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
    user_id: str | None = None,
) -> str | None:
    """
    generation_queue에 완료된 생성 결과 저장.
    반환: 생성된 row의 UUID (실패 시 None).
    """
    try:
        sb = get_supabase()
        uid = _resolve_user_id(user_id)

        row = {
            "user_id": uid,
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
    status: str = "pending",
    user_id: str | None = None,
) -> str | None:
    """
    승인 대기 댓글 추가 (봇 → Supabase).
    반환: 생성된 row UUID (실패 시 None).
    """
    try:
        sb = get_supabase()
        uid = _resolve_user_id(user_id)

        row = {
            "user_id": uid,
            "blog_id": blog_id,
            "post_url": post_url,
            "post_title": post_title,
            "comment_text": comment_text,
            "ai_generated": ai_generated,
            "status": status,
        }

        result = sb.table("pending_comments").insert(row).execute()

        if result.data:
            row_id = result.data[0]["id"]
            logger.info(f"대기댓글 추가: {blog_id} → {row_id[:8]}...")
            return row_id

    except Exception as e:
        logger.error(f"대기댓글 추가 실패: {e}")

    return None


def get_pending_comments_sb(
    status: str = "pending",
    user_id: str | None = None,
) -> list[dict]:
    """
    승인 대기 댓글 목록 조회.
    status: pending, approved, rejected, posted, failed
    """
    try:
        sb = get_supabase()
        uid = _resolve_user_id(user_id)

        result = (
            sb.table("pending_comments")
            .select("id, blog_id, post_url, post_title, comment_text, ai_generated, status, created_at")
            .eq("user_id", uid)
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
    user_id: str | None = None,
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
            "decided_at": datetime.now(timezone.utc).isoformat(),
        }

        if status == "posted":
            update_data["posted_at"] = datetime.now(timezone.utc).isoformat()

        if fail_reason:
            update_data["fail_reason"] = fail_reason

        query = (
            sb.table("pending_comments")
            .update(update_data)
            .eq("id", comment_id)
        )
        if user_id:
            query = query.eq("user_id", user_id)
        result = query.execute()

        if result.data:
            logger.info(f"대기댓글 상태 변경: {comment_id[:8]}... → {status} (by {decided_by})")
            return True

    except Exception as e:
        logger.error(f"대기댓글 상태 변경 실패: {e}")

    return False


def get_pending_count_sb(user_id: str | None = None) -> int:
    """현재 pending 상태 댓글 수 반환."""
    try:
        sb = get_supabase()
        uid = _resolve_user_id(user_id)

        result = (
            sb.table("pending_comments")
            .select("id", count="exact")
            .eq("user_id", uid)
            .eq("status", "pending")
            .execute()
        )

        return result.count or 0

    except Exception as e:
        logger.error(f"대기댓글 수 조회 실패: {e}")
        return 0


# ── bot_cookies (쿠키 업로드) ─────────────────────────────────────────────


def save_bot_cookies_sb(
    cookies: list[dict],
    user_id: str | None = None,
) -> bool:
    """로컬 로그인 성공 시 쿠키를 Supabase에 암호화하여 업로드."""
    try:
        from src.utils.cookie_crypto import encrypt_cookies

        sb = get_supabase()
        uid = _resolve_user_id(user_id)
        encrypted = encrypt_cookies(cookies)
        sb.table("bot_cookies").upsert(
            {
                "user_id": uid,
                "cookie_data": encrypted,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="user_id",
        ).execute()
        logger.info(f"쿠키 Supabase 암호화 업로드 완료: {len(cookies)}개")
        return True
    except Exception as e:
        logger.error(f"쿠키 Supabase 업로드 실패: {e}")
        return False


def get_bot_cookies_sb(user_id: str | None = None) -> list[dict] | None:
    """
    Supabase에서 쿠키 조회 + 복호화.
    하위 호환: 평문 쿠키도 자동 처리.
    반환: 쿠키 딕셔너리 리스트 (없으면 None).
    """
    try:
        from src.utils.cookie_crypto import decrypt_cookies

        sb = get_supabase()
        uid = _resolve_user_id(user_id)

        result = (
            sb.table("bot_cookies")
            .select("cookie_data")
            .eq("user_id", uid)
            .limit(1)
            .execute()
        )

        if result.data and result.data[0].get("cookie_data"):
            raw = result.data[0]["cookie_data"]
            cookies = decrypt_cookies(raw)
            if cookies:
                logger.info(f"Supabase 쿠키 로드: {len(cookies)}개")
                return cookies

    except Exception as e:
        logger.error(f"Supabase 쿠키 조회 실패: {e}")

    return None


# ── bot_settings (봇 설정) ────────────────────────────────────────────────


_DEFAULT_SETTINGS = {
    "approval_mode": "manual",
    "is_active": True,
    "weekday_hours": {"start": 20, "end": 24},
    "weekend_hours": {"start": 13, "end": 18},
    "max_comments_per_day": 30,
    "max_bloggers_per_day": 10,
}


def get_bot_settings_sb(user_id: str | None = None) -> dict:
    """
    봇 설정 조회. 없으면 기본값 반환.
    반환: {approval_mode, is_active, weekday_hours, weekend_hours, max_comments_per_day, max_bloggers_per_day}
    """
    try:
        sb = get_supabase()
        uid = _resolve_user_id(user_id)

        result = (
            sb.table("bot_settings")
            .select("*")
            .eq("user_id", uid)
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
                "comment_prompt": row.get("comment_prompt"),
            }

    except Exception as e:
        logger.error(f"봇 설정 조회 실패: {e}")

    return dict(_DEFAULT_SETTINGS)


def update_bot_settings_sb(user_id: str | None = None, **kwargs) -> bool:
    """
    봇 설정 변경 (upsert).
    지원 키: approval_mode, is_active, weekday_hours, weekend_hours,
            max_comments_per_day, max_bloggers_per_day
    """
    allowed_keys = {
        "approval_mode", "is_active", "weekday_hours", "weekend_hours",
        "max_comments_per_day", "max_bloggers_per_day", "comment_prompt",
    }
    update_data = {k: v for k, v in kwargs.items() if k in allowed_keys}

    if not update_data:
        logger.warning("봇 설정 변경 요청에 유효한 키 없음")
        return False

    try:
        sb = get_supabase()
        uid = _resolve_user_id(user_id)

        update_data["user_id"] = uid
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

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
    user_id: str | None = None,
) -> None:
    """봇 실행 결과를 Supabase에 기록."""
    try:
        sb = get_supabase()
        uid = _resolve_user_id(user_id)

        row = {
            "user_id": uid,
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


def get_recent_runs_sb(
    limit: int = 10,
    user_id: str | None = None,
) -> list[dict]:
    """최근 실행 이력 조회."""
    try:
        sb = get_supabase()
        uid = _resolve_user_id(user_id)

        result = (
            sb.table("bot_run_log")
            .select("id, run_at, bloggers_visited, comments_written, comments_failed, pending_count, error_message, duration_seconds")
            .eq("user_id", uid)
            .order("run_at", desc=True)
            .limit(limit)
            .execute()
        )

        return result.data or []

    except Exception as e:
        logger.error(f"실행 이력 조회 실패: {e}")
        return []


# ── 텔레그램 chat_id 매핑 ─────────────────────────────────────────────────


def get_user_by_chat_id(chat_id: str) -> dict | None:
    """
    telegram_chat_id로 사용자 조회.
    반환: {user_id, naver_blog_id, telegram_chat_id} 또는 None
    """
    try:
        sb = get_supabase()
        result = (
            sb.table("bot_settings")
            .select("user_id, naver_blog_id, telegram_chat_id")
            .eq("telegram_chat_id", chat_id)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.error(f"chat_id 사용자 조회 실패: {e}")
    return None


def register_chat_id(blog_id: str, chat_id: str) -> bool:
    """
    네이버 블로그 ID로 사용자를 찾아 telegram_chat_id 등록.
    반환: 매칭 성공 여부
    """
    try:
        sb = get_supabase()
        # naver_blog_id로 사용자 검색
        result = (
            sb.table("bot_settings")
            .select("user_id, naver_blog_id")
            .eq("naver_blog_id", blog_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            logger.warning(f"블로그 ID '{blog_id}' 매칭 실패")
            return False

        user_id = result.data[0]["user_id"]
        # telegram_chat_id 업데이트
        sb.table("bot_settings").update(
            {"telegram_chat_id": chat_id}
        ).eq("user_id", user_id).execute()

        logger.info(f"텔레그램 chat_id 등록: {blog_id} → {chat_id}")
        return True
    except Exception as e:
        logger.error(f"chat_id 등록 실패: {e}")
        return False


def get_chat_id_for_user(user_id: str) -> str | None:
    """user_id로 telegram_chat_id 조회."""
    try:
        sb = get_supabase()
        result = (
            sb.table("bot_settings")
            .select("telegram_chat_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if result.data and result.data[0].get("telegram_chat_id"):
            return result.data[0]["telegram_chat_id"]
    except Exception as e:
        logger.error(f"chat_id 조회 실패: {e}")
    return None


def record_cookie_expiry(user_id: str) -> None:
    """쿠키 만료 이벤트를 bot_run_log에 에러로 기록."""
    try:
        sb = get_supabase()
        sb.table("bot_run_log").insert({
            "user_id": user_id,
            "bloggers_visited": 0,
            "comments_written": 0,
            "comments_failed": 0,
            "error_message": "쿠키 만료 — 웹에서 재업로드 필요",
        }).execute()
        logger.info(f"쿠키 만료 기록 완료 (user={user_id[:8]})")
    except Exception as e:
        logger.error(f"쿠키 만료 기록 실패: {e}")

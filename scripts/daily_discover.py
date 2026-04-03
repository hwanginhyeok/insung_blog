#!/usr/bin/env python3
"""
매일 1회 실행 — daily_discover=True인 사용자에게 run 명령 큐 추가.
cron: 0 9 * * * /path/to/venv/python /path/to/daily_discover.py
"""
import logging
import sys
import os

# 프로젝트 루트를 sys.path에 추가
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [daily_discover] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> None:
    from src.storage.supabase_client import get_supabase

    sb = get_supabase()

    # daily_discover=True인 활성 사용자 조회
    result = (
        sb.table("bot_settings")
        .select("user_id")
        .eq("daily_discover", True)
        .eq("is_active", True)
        .not_.is_("naver_blog_id", "null")
        .execute()
    )

    users = [row["user_id"] for row in (result.data or [])]
    if not users:
        logger.info("daily_discover 대상 사용자 없음")
        return

    logger.info(f"daily_discover 대상 {len(users)}명 처리")

    for user_id in users:
        try:
            # 이미 pending/running run 명령이 있으면 스킵
            existing = (
                sb.table("bot_commands")
                .select("id")
                .eq("user_id", user_id)
                .eq("command", "run")
                .in_("status", ["pending", "running"])
                .limit(1)
                .execute()
            )
            if existing.data:
                logger.info(f"이미 run 대기 중 — 스킵 (user={user_id[:8]})")
                continue

            sb.table("bot_commands").insert({
                "user_id": user_id,
                "command": "run",
                "status": "pending",
            }).execute()
            logger.info(f"run 명령 큐 추가 (user={user_id[:8]})")

        except Exception as e:
            logger.error(f"run 큐 추가 실패 (user={user_id[:8]}): {e}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
매일 1회 실행 — daily_discover=True인 사용자에게 두 명령을 큐에 추가:
  1. 'run' (기존 댓글 봇 — 방문/댓글)
  2. 'discover_for_review' (V2 AI 필터 발견 — 검토 대기 후보 생성)

cron: 0 9 * * * /path/to/venv/python /path/to/daily_discover.py
권장: 야간 시간(예: 0 2 * * *)에 실행하면 사용자가 아침에 검토 가능.
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
        uid_label = user_id[:8]
        # ── 1. 'run' (기존 댓글 봇)
        try:
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
                logger.info(f"이미 run 대기 중 — 스킵 (user={uid_label})")
            else:
                sb.table("bot_commands").insert({
                    "user_id": user_id,
                    "command": "run",
                    "status": "pending",
                }).execute()
                logger.info(f"run 명령 큐 추가 (user={uid_label})")
        except Exception as e:
            logger.error(f"run 큐 추가 실패 (user={uid_label}): {e}")

        # ── 2. 'discover_for_review' (V2 AI 필터 발견)
        try:
            existing_v2 = (
                sb.table("bot_commands")
                .select("id")
                .eq("user_id", user_id)
                .eq("command", "discover_for_review")
                .in_("status", ["pending", "running"])
                .limit(1)
                .execute()
            )
            if existing_v2.data:
                logger.info(f"이미 discover_for_review 대기 중 — 스킵 (user={uid_label})")
            else:
                sb.table("bot_commands").insert({
                    "user_id": user_id,
                    "command": "discover_for_review",
                    "status": "pending",
                }).execute()
                logger.info(f"discover_for_review 명령 큐 추가 (user={uid_label})")
        except Exception as e:
            logger.error(f"discover_for_review 큐 추가 실패 (user={uid_label}): {e}")


if __name__ == "__main__":
    main()

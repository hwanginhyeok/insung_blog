#!/usr/bin/env python3
"""
일일 관리자 리포트 — 매일 1회 텔레그램으로 전체 사용 통계 전송.

발송 조건: 활성 유저 수 >= MIN_ACTIVE_USERS (기본 10)
  (활성 = 최근 7일 내 generation_queue / bot_run_log / pending_comments 활동 중 하나라도)

포함 지표:
  - 오늘 가입자 수
  - 오늘 글 생성 수 (완료/진행/실패)
  - 오늘 댓글봇 실행 수 (유저별 분포)
  - 오늘 댓글 작성 수 (posted/failed)
  - 오늘 결제액 합계
  - 현재 구독자 수 (active)
  - 실패율 (bot_commands.status='failed' / 전체)

실행:
  python scripts/daily_admin_report.py           # 발송 (조건 충족 시)
  python scripts/daily_admin_report.py --force   # 유저 수 조건 무시하고 강제 발송
  python scripts/daily_admin_report.py --dry-run # 메시지만 출력 (발송 X)

cron:
  0 22 * * * cd /home/window11/insung_blog && .venv/bin/python scripts/daily_admin_report.py
"""
import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from src.storage.supabase_client import get_supabase
from src.utils.logger import logger
from src.utils.telegram_notifier import send_telegram_message

MIN_ACTIVE_USERS = 10
KST = timezone(timedelta(hours=9))


def _today_kst_range() -> tuple[str, str]:
    """오늘 00:00 KST ~ 현재의 ISO8601 UTC 문자열 쌍."""
    now_kst = datetime.now(KST)
    start_kst = now_kst.replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        start_kst.astimezone(timezone.utc).isoformat(),
        now_kst.astimezone(timezone.utc).isoformat(),
    )


def _week_ago_utc() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()


def count_active_users(sb) -> int:
    """최근 7일 내 생성/봇실행/댓글 활동이 있는 유저 수."""
    week_ago = _week_ago_utc()
    ids: set[str] = set()
    for table, col in [
        ("generation_queue", "created_at"),
        ("bot_run_log", "run_at"),
        ("pending_comments", "created_at"),
    ]:
        try:
            r = (
                sb.table(table)
                .select("user_id")
                .gte(col, week_ago)
                .execute()
            )
            for row in r.data or []:
                if row.get("user_id"):
                    ids.add(row["user_id"])
        except Exception as e:
            logger.debug(f"{table} 활성유저 집계 실패: {e}")
    return len(ids)


def collect_today_stats(sb) -> dict:
    """오늘의 핵심 지표 수집."""
    start, _ = _today_kst_range()

    stats: dict = {}

    # 신규 가입
    try:
        r = sb.table("users").select("id", count="exact").gte("created_at", start).execute()
        stats["new_users"] = r.count or 0
    except Exception as e:
        logger.debug(f"new_users 집계 실패: {e}")
        stats["new_users"] = 0

    # 글 생성 (상태별)
    gen_by_status: dict[str, int] = {}
    try:
        r = sb.table("generation_queue").select("status").gte("created_at", start).execute()
        for row in r.data or []:
            s = row.get("status", "unknown")
            gen_by_status[s] = gen_by_status.get(s, 0) + 1
    except Exception as e:
        logger.debug(f"generation 집계 실패: {e}")
    stats["generation"] = gen_by_status
    stats["generation_total"] = sum(gen_by_status.values())

    # 댓글봇 실행
    try:
        r = sb.table("bot_run_log").select("user_id, comments_written, comments_failed").gte("run_at", start).execute()
        bot_rows = r.data or []
        stats["bot_runs"] = len(bot_rows)
        stats["bot_users"] = len({row.get("user_id") for row in bot_rows if row.get("user_id")})
        stats["bot_comments_written"] = sum(row.get("comments_written", 0) or 0 for row in bot_rows)
        stats["bot_comments_failed"] = sum(row.get("comments_failed", 0) or 0 for row in bot_rows)
    except Exception as e:
        logger.debug(f"bot_run_log 집계 실패: {e}")
        stats["bot_runs"] = 0
        stats["bot_users"] = 0
        stats["bot_comments_written"] = 0
        stats["bot_comments_failed"] = 0

    # 댓글 상태 분포 (오늘 생성된 것)
    comment_by_status: dict[str, int] = {}
    try:
        r = sb.table("pending_comments").select("status").gte("created_at", start).execute()
        for row in r.data or []:
            s = row.get("status", "unknown")
            comment_by_status[s] = comment_by_status.get(s, 0) + 1
    except Exception as e:
        logger.debug(f"pending_comments 집계 실패: {e}")
    stats["comments"] = comment_by_status

    # 결제
    try:
        r = sb.table("payments").select("amount, status").gte("paid_at", start).execute()
        paid = [row for row in (r.data or []) if row.get("status") == "paid"]
        stats["payment_count"] = len(paid)
        stats["payment_amount"] = sum(row.get("amount", 0) or 0 for row in paid)
    except Exception as e:
        logger.debug(f"payments 집계 실패: {e}")
        stats["payment_count"] = 0
        stats["payment_amount"] = 0

    # 구독 현황 (전체 active)
    try:
        r = (
            sb.table("users")
            .select("id", count="exact")
            .eq("subscription_status", "active")
            .execute()
        )
        stats["active_subscribers"] = r.count or 0
    except Exception as e:
        logger.debug(f"구독 집계 실패: {e}")
        stats["active_subscribers"] = 0

    # 명령 실패율
    try:
        r = sb.table("bot_commands").select("status").gte("created_at", start).execute()
        cmd_rows = r.data or []
        total = len(cmd_rows)
        failed = sum(1 for row in cmd_rows if row.get("status") == "failed")
        stats["cmd_total"] = total
        stats["cmd_failed"] = failed
        stats["cmd_fail_rate"] = round(failed / total * 100, 1) if total else 0.0
    except Exception as e:
        logger.debug(f"bot_commands 집계 실패: {e}")
        stats["cmd_total"] = 0
        stats["cmd_failed"] = 0
        stats["cmd_fail_rate"] = 0.0

    return stats


def format_report(stats: dict, active_users: int) -> str:
    """텔레그램 HTML 리포트 포맷."""
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M")

    gen = stats["generation"]
    gen_done = gen.get("completed", 0)
    gen_fail = gen.get("failed", 0) + gen.get("save_failed", 0)
    gen_running = stats["generation_total"] - gen_done - gen_fail

    cm = stats["comments"]
    cm_posted = cm.get("posted", 0)
    cm_pending = cm.get("pending", 0)
    cm_approved = cm.get("approved", 0)
    cm_rejected = cm.get("rejected", 0)
    cm_failed = cm.get("failed", 0)

    amount_k = f"{stats['payment_amount']:,}원" if stats['payment_amount'] else "0원"

    lines = [
        f"📊 <b>일일 운영 리포트</b>",
        f"<i>{now} KST</i>",
        f"",
        f"👥 <b>유저</b>",
        f"  · 활성(7d): <b>{active_users}명</b>",
        f"  · 오늘 신규: {stats['new_users']}명",
        f"  · 활성 구독: {stats['active_subscribers']}명",
        f"",
        f"✍️ <b>글 생성</b>  {stats['generation_total']}건",
        f"  · 완료 {gen_done} / 진행 {gen_running} / 실패 {gen_fail}",
        f"",
        f"🤖 <b>댓글봇</b>  {stats['bot_runs']}회 ({stats['bot_users']}명)",
        f"  · 작성 {stats['bot_comments_written']} / 실패 {stats['bot_comments_failed']}",
        f"",
        f"💬 <b>댓글</b>",
        f"  · posted {cm_posted} / approved {cm_approved} / pending {cm_pending}",
        f"  · rejected {cm_rejected} / failed {cm_failed}",
        f"",
        f"💰 <b>결제</b>",
        f"  · 건수 {stats['payment_count']}건 / 합계 <b>{amount_k}</b>",
        f"",
        f"⚙️ <b>명령 실패율</b>  {stats['cmd_fail_rate']}% ({stats['cmd_failed']}/{stats['cmd_total']})",
    ]
    return "\n".join(lines)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="활성 유저 수 조건 무시")
    parser.add_argument("--dry-run", action="store_true", help="전송하지 않고 출력만")
    args = parser.parse_args()

    sb = get_supabase()
    active = count_active_users(sb)
    logger.info(f"활성 유저(7일): {active}명 (임계값 {MIN_ACTIVE_USERS})")

    if not args.force and active < MIN_ACTIVE_USERS:
        logger.info(f"활성 유저 {active} < {MIN_ACTIVE_USERS} — 발송 생략")
        print(f"SKIP: active={active} < {MIN_ACTIVE_USERS}")
        return

    stats = collect_today_stats(sb)
    report = format_report(stats, active)

    if args.dry_run:
        print(report)
        return

    ok = await send_telegram_message(report)
    logger.info(f"일일 리포트 발송 {'성공' if ok else '실패'}")
    print(f"SENT: {ok}")


if __name__ == "__main__":
    asyncio.run(main())

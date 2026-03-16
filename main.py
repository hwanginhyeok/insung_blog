"""
스케줄러 진입점

사용법:
  python main.py                  # 매일 10:00 자동 실행 (스케줄 모드)
  python main.py --run-once       # 즉시 1회 실행 (admin)
  python main.py --run-once --dry-run  # 댓글 입력만, 실제 제출 없음
  python main.py --run-once --all-users  # 모든 활성 사용자 순회 실행

다중 사용자: --all-users 플래그로 get_active_user_ids() 순회
"""
import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가 (패키지 import 해결)
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv()

import schedule
import time

from config.settings import SCHEDULE_RANDOM_OFFSET_MAX, SCHEDULE_TIME
from src.orchestrator import run
from src.utils.logger import logger
from src.utils.time_guard import is_allowed_time


async def _run_all_users(dry_run: bool) -> None:
    """모든 활성 사용자에 대해 순차 실행."""
    from src.storage.supabase_client import get_active_user_ids

    user_ids = get_active_user_ids()
    if not user_ids:
        logger.info("활성 사용자 없음 — 종료")
        return

    logger.info(f"▶ 다중 사용자 실행 시작: {len(user_ids)}명")

    for user_id in user_ids:
        try:
            logger.info(f"━━━ 사용자 {user_id[:8]} 실행 시작 ━━━")
            await run(dry_run=dry_run, user_id=user_id)
        except Exception as e:
            logger.error(f"사용자 {user_id[:8]} 실행 실패: {e}")
        await asyncio.sleep(10)  # 사용자 간 간격

    logger.info("▶ 다중 사용자 실행 완료")


def _run_job(dry_run: bool, all_users: bool = False) -> None:
    """schedule 라이브러리에서 호출하는 동기 래퍼"""
    if not is_allowed_time():
        logger.info("허용 시간대 아님 — 이번 실행 스킵")
        return
    logger.info(f"자동 실행 시작 {'[dry-run]' if dry_run else ''}")

    if all_users:
        asyncio.run(_run_all_users(dry_run=dry_run))
    else:
        asyncio.run(run(dry_run=dry_run))


def main() -> None:
    parser = argparse.ArgumentParser(description="네이버 블로그 자동 답방 댓글")
    parser.add_argument(
        "--run-once",
        action="store_true",
        help="스케줄 없이 즉시 1회 실행",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="실제 댓글 제출 없이 수집/입력만 시뮬레이션",
    )
    parser.add_argument(
        "--test-visit",
        metavar="BLOG_ID",
        help="commenter 수집 없이 지정한 블로그 ID를 직접 방문 (테스트용)",
    )
    parser.add_argument(
        "--all-users",
        action="store_true",
        help="모든 활성 사용자에 대해 봇 실행 (다중 사용자 모드)",
    )
    args = parser.parse_args()

    if args.run_once or args.test_visit:
        label = f"{'[dry-run] ' if args.dry_run else ''}{'[test-visit: ' + args.test_visit + '] ' if args.test_visit else ''}"
        logger.info(f"수동 실행 {label}")

        if args.all_users:
            asyncio.run(_run_all_users(dry_run=args.dry_run))
        else:
            asyncio.run(run(dry_run=args.dry_run, test_visit=args.test_visit))
        return

    # 스케줄 모드: 매일 SCHEDULE_TIME ± SCHEDULE_RANDOM_OFFSET_MAX분에 실행
    all_users = args.all_users
    offset = random.randint(-SCHEDULE_RANDOM_OFFSET_MAX, SCHEDULE_RANDOM_OFFSET_MAX)
    base_dt = datetime.strptime(SCHEDULE_TIME, "%H:%M")
    run_time = (base_dt + timedelta(minutes=offset)).strftime("%H:%M")
    mode_label = "다중 사용자" if all_users else "admin 전용"
    logger.info(
        f"스케줄 모드 시작 ({mode_label}) — 오늘 {run_time} 실행 "
        f"(기준 {SCHEDULE_TIME}, 오프셋 {offset:+d}분)"
    )
    schedule.every().day.at(run_time).do(_run_job, dry_run=args.dry_run, all_users=all_users)

    while True:
        schedule.run_pending()
        time.sleep(30)


if __name__ == "__main__":
    main()

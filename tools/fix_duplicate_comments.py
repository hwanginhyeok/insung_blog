"""
중복 댓글 정리 스크립트.

pending_comments 테이블에서 (post_url, user_id) 기준 중복 행을 찾아
우선순위(posted > approved > pending > rejected > failed)에 따라 1개만 유지,
나머지는 status='rejected', fail_reason='중복 자동 제거'로 변경한다.

사용법:
    python tools/fix_duplicate_comments.py --dry-run   # 대상만 출력 (변경 없음)
    python tools/fix_duplicate_comments.py              # 실제 정리 실행
"""

import argparse
import os
import sys
from collections import defaultdict

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from src.storage.supabase_client import get_supabase
from src.utils.logger import setup_logger

logger = setup_logger("fix_duplicates")

# 상태 우선순위 — 숫자가 작을수록 우선 보존
STATUS_PRIORITY = {
    "posted": 0,
    "approved": 1,
    "pending": 2,
    "rejected": 3,
    "failed": 4,
}


def fetch_all_pending_comments() -> list[dict]:
    """pending_comments 전체 조회 (페이지네이션 포함)."""
    sb = get_supabase()
    all_rows = []
    offset = 0
    page_size = 1000

    while True:
        result = (
            sb.table("pending_comments")
            .select("id, post_url, user_id, status, created_at")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size

    return all_rows


def find_duplicates(rows: list[dict]) -> dict[tuple, list[dict]]:
    """(post_url, user_id) 기준 중복 그룹 반환. 2개 이상인 것만."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        key = (row["post_url"], row["user_id"])
        groups[key].append(row)

    # 2개 이상인 그룹만 반환
    return {k: v for k, v in groups.items() if len(v) >= 2}


def pick_keeper_and_rejects(group: list[dict]) -> tuple[dict, list[dict]]:
    """
    그룹에서 보존할 1개와 제거 대상을 분리.
    우선순위: posted > approved > pending > rejected > failed
    같은 우선순위면 created_at이 가장 이른(오래된) 것 보존.
    """
    sorted_group = sorted(
        group,
        key=lambda r: (
            STATUS_PRIORITY.get(r["status"], 99),
            r.get("created_at", ""),
        ),
    )
    return sorted_group[0], sorted_group[1:]


def main():
    parser = argparse.ArgumentParser(description="중복 댓글 정리")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="실제 변경 없이 대상만 출력",
    )
    args = parser.parse_args()

    logger.info("중복 댓글 정리 시작 (dry-run=%s)", args.dry_run)

    # 1. 전체 조회
    rows = fetch_all_pending_comments()
    logger.info("전체 pending_comments: %d건", len(rows))

    # 2. 중복 그룹 찾기
    duplicates = find_duplicates(rows)
    total_duplicate_pairs = len(duplicates)
    total_reject_count = sum(len(v) - 1 for v in duplicates.values())

    logger.info("중복 그룹: %d개, 제거 대상: %d건", total_duplicate_pairs, total_reject_count)

    if total_duplicate_pairs == 0:
        logger.info("중복 없음 - 종료")
        return

    # 3. 각 그룹 처리
    sb = get_supabase()
    rejected_count = 0

    for (post_url, user_id), group in duplicates.items():
        keeper, rejects = pick_keeper_and_rejects(group)
        url_short = post_url[:60] if post_url else "?"
        uid_short = user_id[:8] if user_id else "?"

        if args.dry_run:
            print(
                f"[DRY-RUN] {url_short}... (user={uid_short}): "
                f"보존={keeper['id'][:8]}({keeper['status']}), "
                f"제거={len(rejects)}건"
            )
            for r in rejects:
                print(f"  - {r['id'][:8]} ({r['status']}, {r.get('created_at', '?')})")
        else:
            for r in rejects:
                try:
                    sb.table("pending_comments").update(
                        {
                            "status": "rejected",
                            "fail_reason": "중복 자동 제거",
                        }
                    ).eq("id", r["id"]).execute()
                    rejected_count += 1
                except Exception as e:
                    logger.error("상태 변경 실패 (id=%s): %s", r["id"][:8], e)

    if args.dry_run:
        print(f"\n총 {total_duplicate_pairs}개 그룹, {total_reject_count}건 제거 예정")
    else:
        logger.info(
            "중복 정리 완료: %d개 그룹, %d건 rejected 처리",
            total_duplicate_pairs,
            rejected_count,
        )


if __name__ == "__main__":
    main()

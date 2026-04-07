#!/usr/bin/env python3
"""
블로그 방문자수 수집 스크립트.

사용자별 네이버 블로그 일일/전체 방문자수를 수집하여 Supabase에 저장.
m.blog.naver.com의 __INITIAL_STATE__ JSON에서 파싱.

cron 예시 (일 3회: 09:00, 15:00, 23:50):
  0 9,15 * * * cd ~/insung_blog && .venv/bin/python scripts/collect_visitor_stats.py
  50 23 * * * cd ~/insung_blog && .venv/bin/python scripts/collect_visitor_stats.py

같은 날 여러 번 수집 시 UPSERT로 MAX값 유지.
"""
import json
import logging
import os
import re
import sys
from datetime import date

import httpx

# 프로젝트 루트를 sys.path에 추가
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

# dotenv 로드
from dotenv import load_dotenv
load_dotenv(os.path.join(_ROOT, ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [visitor_stats] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# 모바일 User-Agent
_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

_INITIAL_STATE_RE = re.compile(r"window\.__INITIAL_STATE__\s*=\s*({.*?})\s*;")


def fetch_visitor_count(blog_id: str) -> dict | None:
    """네이버 블로그 방문자수 수집. 실패 시 None 반환."""
    url = f"https://m.blog.naver.com/{blog_id}"
    try:
        resp = httpx.get(url, headers={"User-Agent": _UA}, timeout=15, follow_redirects=True)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        logger.error(f"{blog_id}: HTTP 요청 실패 — {e}")
        return None

    match = _INITIAL_STATE_RE.search(resp.text)
    if not match:
        logger.error(f"{blog_id}: __INITIAL_STATE__ 파싱 실패")
        return None

    try:
        data = json.loads(match.group(1))
        info = data["blogHome"]["blogHomeInfo"][blog_id]["data"]
        result = {
            "blog_id": blog_id,
            "day_visitor_count": info.get("dayVisitorCount", 0),
            "total_visitor_count": info.get("totalVisitorCount", 0),
            "subscriber_count": info.get("subscriberCount", 0),
        }
        logger.info(
            f"{blog_id}: 오늘={result['day_visitor_count']}, "
            f"전체={result['total_visitor_count']}, "
            f"구독={result['subscriber_count']}"
        )
        return result
    except (KeyError, TypeError) as e:
        logger.error(f"{blog_id}: JSON 구조 변경 — {e}")
        return None


def save_to_supabase(user_id: str, stats: dict) -> bool:
    """Supabase에 UPSERT (같은 날짜면 MAX값 유지)."""
    from src.storage.supabase_client import get_supabase

    sb = get_supabase()
    today = date.today().isoformat()

    # 기존 레코드 확인
    existing = (
        sb.table("blog_visitor_stats")
        .select("id, day_visitor_count")
        .eq("user_id", user_id)
        .eq("blog_id", stats["blog_id"])
        .eq("date", today)
        .execute()
    )

    if existing.data:
        # MAX값 유지
        old_count = existing.data[0]["day_visitor_count"] or 0
        new_count = max(old_count, stats["day_visitor_count"])
        sb.table("blog_visitor_stats").update({
            "day_visitor_count": new_count,
            "total_visitor_count": stats["total_visitor_count"],
            "subscriber_count": stats["subscriber_count"],
        }).eq("id", existing.data[0]["id"]).execute()
        logger.info(f"{stats['blog_id']}: 업데이트 (방문자 {old_count}→{new_count})")
    else:
        # 신규 삽입
        sb.table("blog_visitor_stats").insert({
            "user_id": user_id,
            "blog_id": stats["blog_id"],
            "date": today,
            "day_visitor_count": stats["day_visitor_count"],
            "total_visitor_count": stats["total_visitor_count"],
            "subscriber_count": stats["subscriber_count"],
        }).execute()
        logger.info(f"{stats['blog_id']}: 신규 저장")

    return True


def main() -> None:
    from src.storage.supabase_client import get_supabase

    sb = get_supabase()

    # blog_id가 등록된 사용자 조회
    result = (
        sb.table("bot_settings")
        .select("user_id, naver_blog_id")
        .eq("is_active", True)
        .execute()
    )

    if not result.data:
        logger.info("활성 사용자 없음")
        return

    success_count = 0
    fail_count = 0

    for row in result.data:
        user_id = row["user_id"]
        blog_id = row.get("naver_blog_id")

        if not blog_id:
            logger.warning(f"user={user_id[:8]}: naver_blog_id 없음 — 스킵")
            continue

        stats = fetch_visitor_count(blog_id)
        if stats:
            try:
                save_to_supabase(user_id, stats)
                success_count += 1
            except Exception as e:
                logger.error(f"{blog_id}: DB 저장 실패 — {e}")
                fail_count += 1
        else:
            fail_count += 1

    logger.info(f"수집 완료: 성공 {success_count}건, 실패 {fail_count}건")


if __name__ == "__main__":
    main()

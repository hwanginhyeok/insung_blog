"""
이웃 발견 V2 — AI 필터 + 사용자 컨펌 워크플로우 (Phase 2 of NEIGHBOR-AI-DISCOVER)

기존 neighbor_discoverer.py와 공존:
  - V1: 검색 → 즉시 neighbors 테이블 추가 (자동 모드)
  - V2: 검색 → AI 판정 → neighbor_candidates pending → 사용자 컨펌 → neighbors

흐름:
  1. bot_settings.discovered_keywords 사용 (Phase 1에서 추출됨, 없으면 자동 추출)
  2. 키워드별 search.naver.com에서 후보 50명까지 수집
  3. 필터: 기존 이웃 / 자기 블로그 / 영구차단 캐시 / 이미 있는 candidates 제외
  4. 각 후보 → judge_blog (캐시 우선)
  5. ok + relevant/uncertain → neighbor_candidates pending 적재
  6. 영구차단 4종 → 캐시만, 사용자 후보엔 안 들어감
  7. review_farm/inactive/off_topic → 캐시만 (분류 자산), 후보엔 안 들어감
"""
from __future__ import annotations

import re
from typing import Any

from playwright.async_api import Page

from config.settings import (
    MAX_DISCOVER_PER_KEYWORD,
    NAVER_BLOG_SEARCH_URL,
    NEIGHBOR_SKIP_BLOG_IDS,
)
from src.neighbor.ai_filter import calc_relevance, judge_blog
from src.neighbor.blog_profile_extractor import update_user_blog_profile
from src.neighbor.neighbor_sync import get_neighbors
from src.storage.supabase_client import get_supabase
from src.utils.delay import delay_between_bloggers
from src.utils.logger import setup_logger

logger = setup_logger("neighbor_discoverer_v2")

# V2 한도
SEARCH_PER_KEYWORD = 20  # 키워드당 검색 결과 수집
MAX_CANDIDATES_TO_REVIEW = 100  # 사용자에게 노출 최대
MAX_HAIKU_JUDGMENTS_PER_RUN = 150  # Haiku 호출 상한 (캐시 있으니 실 호출 적음)


# ============================================================
# 1. 검색 (네이버 블로그 탭)
# ============================================================
async def _search_blogs(page: Page, keyword: str, limit: int) -> list[tuple[str, str]]:
    """네이버 블로그 검색 결과에서 (blog_id, blog_name) 추출."""
    await page.goto(
        NAVER_BLOG_SEARCH_URL.format(keyword=keyword),
        wait_until="domcontentloaded",
        timeout=15_000,
    )
    await page.wait_for_timeout(2000)

    results: list[tuple[str, str]] = []
    seen: set[str] = set()

    for link in await page.query_selector_all('a[href*="blog.naver.com/"]'):
        try:
            href = await link.get_attribute("href") or ""
            match = re.search(r"blog\.naver\.com/([a-zA-Z0-9_-]+)", href)
            if not match:
                continue

            blog_id = match.group(1)
            if blog_id.isdigit() or blog_id in seen or blog_id in NEIGHBOR_SKIP_BLOG_IDS:
                continue
            seen.add(blog_id)

            blog_name = await _extract_link_text(link) or blog_id
            results.append((blog_id, blog_name))

            if len(results) >= limit:
                break
        except Exception:
            continue

    return results


async def _extract_link_text(link) -> str:
    """링크 내부에서 닉네임 텍스트 추출 시도."""
    try:
        text = await link.inner_text()
        return (text or "").strip()[:80]
    except Exception:
        return ""


# ============================================================
# 2. 필터링 (기존 이웃 / 자기 / 영구차단 / 이미 있는 후보)
# ============================================================
def _build_exclusion_set(user_id: str, my_blog_ids: set[str]) -> set[str]:
    """이번 발견에서 제외할 blog_id 세트."""
    sb = get_supabase()
    excluded: set[str] = set(my_blog_ids)

    # 기존 이웃
    for n in get_neighbors(user_id=user_id):
        if n.get("blog_id"):
            excluded.add(n["blog_id"])

    # 사용자별 후보 (pending/approved/rejected/expired 모두 — 한 번 본 사람 다시 안 봄)
    try:
        res = sb.table("neighbor_candidates").select("blog_id").eq("user_id", user_id).execute()
        for row in res.data or []:
            if row.get("blog_id"):
                excluded.add(row["blog_id"])
    except Exception as e:
        logger.warning(f"candidates 조회 실패: {e}")

    # 영구차단 글로벌 캐시
    try:
        res = sb.table("neighbor_blog_profile").select("blog_id").eq("permanently_blocked", True).execute()
        for row in res.data or []:
            if row.get("blog_id"):
                excluded.add(row["blog_id"])
    except Exception as e:
        logger.warning(f"영구차단 조회 실패: {e}")

    return excluded


# ============================================================
# 3. 메인 흐름
# ============================================================
async def discover_for_review(
    page: Page,
    user_id: str,
    my_blog_id: str,
    my_blog_ids: set[str] | None = None,
    keywords_override: list[str] | None = None,
) -> dict[str, Any]:
    """
    V2 발견 흐름. 검색 → AI 판정 → neighbor_candidates 적재.

    Args:
        page: Playwright Page
        user_id: 사용자 UUID
        my_blog_id: 사용자 본인 blog_id
        my_blog_ids: 본인 부계정 blog_id들
        keywords_override: 키워드 직접 지정 (None이면 bot_settings.discovered_keywords)

    Returns:
        {
            "ok": bool,
            "candidates_added": int,
            "stats": {
                "searched": int,
                "filtered_out": int,
                "judged": int,
                "from_cache": int,
                "by_flag": {ok, ad, ai, ...},
                "candidates_added": int,
                "off_topic": int,
            },
            "message": str,
        }
    """
    sb = get_supabase()

    # ── 사용자 블로그 분야 자동 추출 (없거나 30일 경과)
    profile_result = update_user_blog_profile(user_id, force=False)
    if not profile_result.get("ok"):
        return {
            "ok": False,
            "candidates_added": 0,
            "stats": {},
            "message": f"사용자 블로그 분석 실패: {profile_result.get('reason', 'unknown')}",
        }

    user_categories = profile_result.get("categories", []) or []
    user_keywords = profile_result.get("keywords", []) or []

    # ── 검색 키워드 결정
    keywords = keywords_override or user_keywords
    if not keywords:
        return {
            "ok": False,
            "candidates_added": 0,
            "stats": {},
            "message": "검색 키워드 없음 (사용자 블로그 분석 결과 비어있음)",
        }

    excluded = _build_exclusion_set(user_id, my_blog_ids or {my_blog_id})
    excluded.add(my_blog_id)

    # ── 키워드별 검색
    raw_candidates: list[tuple[str, str, str]] = []  # (blog_id, blog_name, source_keyword)
    seen_in_run: set[str] = set()

    for keyword in keywords[:12]:  # 키워드 상한 12개
        try:
            results = await _search_blogs(page, keyword, SEARCH_PER_KEYWORD)
            logger.info(f"  키워드 '{keyword}' → {len(results)}명 검색됨")

            for blog_id, blog_name in results:
                if blog_id in excluded or blog_id in seen_in_run:
                    continue
                seen_in_run.add(blog_id)
                raw_candidates.append((blog_id, blog_name, keyword))

            if len(keywords) > 1:
                await delay_between_bloggers()
        except Exception as e:
            logger.warning(f"  키워드 '{keyword}' 검색 실패: {e}")

    searched = len(raw_candidates)
    filtered_out = sum(len(seen_in_run) for _ in [None]) + len(excluded)  # 참고용

    if not raw_candidates:
        return {
            "ok": True,
            "candidates_added": 0,
            "stats": {"searched": 0, "judged": 0, "candidates_added": 0},
            "message": "새로 발견할 블로거가 없습니다 (모두 이미 본 블로거)",
        }

    # ── Haiku 판정 + 적재
    stats_by_flag: dict[str, int] = {}
    judged = 0
    from_cache = 0
    off_topic = 0
    candidates_added = 0
    haiku_calls = 0

    for blog_id, blog_name, source_keyword in raw_candidates:
        if candidates_added >= MAX_CANDIDATES_TO_REVIEW:
            break
        if haiku_calls >= MAX_HAIKU_JUDGMENTS_PER_RUN:
            logger.warning(f"Haiku 호출 상한({MAX_HAIKU_JUDGMENTS_PER_RUN}) 도달 — 중단")
            break

        result = judge_blog(blog_id, force=False)
        if not result:
            continue

        judged += 1
        if result["from_cache"]:
            from_cache += 1
        else:
            haiku_calls += 1

        flag = result["quality_flag"]
        stats_by_flag[flag] = stats_by_flag.get(flag, 0) + 1

        # 영구차단 / 휴면 / 분류만 → 후보 적재 X
        if result["permanently_blocked"] or flag in ("inactive", "review_farm"):
            continue

        # ok 외엔 후보 적재 X (현재는 ok만 추천)
        if flag != "ok":
            continue

        # 사용자 분야 매칭
        relevance, score = calc_relevance(
            user_categories=user_categories,
            user_keywords=user_keywords,
            main_topics=result["main_topics"],
        )

        if relevance == "off_topic":
            off_topic += 1
            continue

        # neighbor_candidates 적재
        try:
            sb.table("neighbor_candidates").upsert(
                {
                    "user_id": user_id,
                    "blog_id": blog_id,
                    "status": "pending",
                    "relevance": relevance,
                    "relevance_score": round(score, 2),
                    "source_keywords": [source_keyword],
                    "reasoning": result["reasoning"],
                },
                on_conflict="user_id,blog_id",
            ).execute()
            candidates_added += 1
            logger.info(
                f"  ✓ 후보 적재 [{blog_id}] flag={flag} relevance={relevance} score={score:.2f}"
            )
        except Exception as e:
            logger.warning(f"candidates upsert 실패 [{blog_id}]: {e}")

    # ── 자동 모드 처리 (Phase 5)
    auto_approved = 0
    try:
        s = sb.table("bot_settings").select("auto_discover_mode").eq("user_id", user_id).limit(1).execute()
        if s.data and s.data[0].get("auto_discover_mode"):
            # 방금 적재된 pending 후보들 자동 승인 + neighbors 추가
            pending_res = (
                sb.table("neighbor_candidates")
                .select("id, blog_id")
                .eq("user_id", user_id)
                .eq("status", "pending")
                .execute()
            )
            from datetime import datetime as dt, timezone as tz
            now_iso = dt.now(tz.utc).isoformat()

            for cand in pending_res.data or []:
                try:
                    sb.table("neighbor_candidates").update({
                        "status": "approved",
                        "reviewed_at": now_iso,
                    }).eq("id", cand["id"]).execute()

                    sb.table("neighbors").upsert(
                        {
                            "user_id": user_id,
                            "blog_id": cand["blog_id"],
                            "neighbor_type": "discovered",
                            "category": "ai_auto",
                        },
                        on_conflict="user_id,blog_id",
                    ).execute()
                    auto_approved += 1
                except Exception as auto_err:
                    logger.warning(f"자동 승인 실패 [{cand['blog_id']}]: {auto_err}")

            if auto_approved > 0:
                logger.info(f"  ⚡ 자동 모드: {auto_approved}명 즉시 승인 + 이웃 추가")
    except Exception as auto_check_err:
        logger.warning(f"auto_discover_mode 체크 실패: {auto_check_err}")

    msg_suffix = ""
    if auto_approved > 0:
        msg_suffix = f" → 자동 모드로 {auto_approved}명 즉시 추가됨"

    return {
        "ok": True,
        "candidates_added": candidates_added,
        "auto_approved": auto_approved,
        "stats": {
            "searched": searched,
            "judged": judged,
            "from_cache": from_cache,
            "haiku_calls": haiku_calls,
            "by_flag": stats_by_flag,
            "candidates_added": candidates_added,
            "off_topic": off_topic,
            "auto_approved": auto_approved,
        },
        "message": f"{candidates_added}명의 후보가 검토 대기 중입니다 (검색 {searched}명, 판정 {judged}명, 캐시 hit {from_cache}명){msg_suffix}",
    }

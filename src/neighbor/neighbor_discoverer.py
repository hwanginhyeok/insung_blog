"""
이웃 발견 — 네이버 블로그 검색으로 새 블로거를 탐색하여 neighbors 테이블에 저장.

흐름:
  1. 키워드로 search.naver.com 블로그 탭 검색
  2. 검색 결과에서 blog_id + 닉네임 추출
  3. 기존 이웃 필터링 후 neighbor_type='discovered'로 저장
"""
import re

from playwright.async_api import Page

from config.settings import (
    MAX_DISCOVER_PER_KEYWORD,
    MAX_DISCOVER_TOTAL,
    NAVER_BLOG_SEARCH_URL,
    NEIGHBOR_SKIP_BLOG_IDS,
)
from src.neighbor.neighbor_sync import get_neighbors, upsert_neighbor
from src.utils.delay import delay_between_bloggers
from src.utils.logger import setup_logger

logger = setup_logger("neighbor_discoverer")


async def discover_neighbors(
    page: Page,
    keywords: list[str],
    user_id: str,
    my_blog_id: str,
    max_results: int = MAX_DISCOVER_TOTAL,
) -> dict:
    """키워드 기반 새 블로거 발견. 결과를 neighbors 테이블에 저장."""
    existing_ids = {n["blog_id"] for n in get_neighbors(user_id=user_id)}
    existing_ids.add(my_blog_id)

    discovered: list[dict] = []
    skipped = 0

    for keyword in keywords:
        if len(discovered) >= max_results:
            break

        logger.info(f"▶ 키워드 검색: '{keyword}'")
        try:
            results = await _search_blogs(page, keyword)
            logger.info(f"  검색 결과: {len(results)}명")

            for blog_id, blog_name in results:
                if len(discovered) >= max_results:
                    break
                if blog_id in existing_ids or blog_id in {d["blog_id"] for d in discovered}:
                    skipped += 1
                    continue
                if upsert_neighbor(blog_id=blog_id, blog_name=blog_name,
                                   neighbor_type="discovered", category=keyword,
                                   user_id=user_id):
                    discovered.append({"blog_id": blog_id, "blog_name": blog_name})
                    logger.info(f"  ✓ 발견: {blog_id} ({blog_name})")
        except Exception as e:
            logger.warning(f"  키워드 '{keyword}' 검색 실패: {e}")

        if len(keywords) > 1:
            await delay_between_bloggers()

    logger.info(f"이웃 발견 완료: {len(discovered)}명 발견, {skipped}명 스킵")
    return {
        "discovered": len(discovered),
        "skipped": skipped,
        "bloggers": [d["blog_id"] for d in discovered],
        "message": f"{len(discovered)}명의 새 블로거를 발견했습니다",
    }


async def _search_blogs(page: Page, keyword: str) -> list[tuple[str, str]]:
    """네이버 블로그 검색 결과에서 (blog_id, blog_name) 목록 추출."""
    await page.goto(
        NAVER_BLOG_SEARCH_URL.format(keyword=keyword),
        wait_until="domcontentloaded", timeout=15_000,
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

            blog_name = await _extract_name(link) or blog_id
            results.append((blog_id, blog_name))

            if len(results) >= MAX_DISCOVER_PER_KEYWORD:
                break
        except Exception:
            continue

    return results


async def _extract_name(link) -> str:
    """검색 결과 링크 주변에서 블로그 닉네임 추출."""
    try:
        parent = await link.evaluate_handle(
            "el => el.closest('.detail_box, .api_txt_lines, .total_area, .user_info')"
        )
        if parent:
            name_el = await parent.as_element().query_selector(
                ".name, .sub_txt, .nickname, .user_name"
            )
            if name_el:
                return (await name_el.inner_text()).strip()
    except Exception:
        pass
    # 폴백: 링크 텍스트
    try:
        text = (await link.inner_text()).strip()
        if text and len(text) < 30 and not text.startswith("http"):
            return text
    except Exception:
        pass
    return ""

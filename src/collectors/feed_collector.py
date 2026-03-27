"""
이웃 새글 피드 수집 — 네이버 블로그 이웃 새글 페이지에서 최신 게시물 수집.

네이버 이웃 새글 피드 URL:
  https://m.blog.naver.com/FeedList.naver (모바일)
  → 이웃들이 최근 작성한 게시물이 시간순으로 표시

흐름:
  1. 이웃 새글 피드 페이지 접속
  2. 게시물 목록 파싱 (blog_id, log_no, title)
  3. 내 블로그 글 + 이미 댓글 단 글 제외
  4. (url, title, blog_id) 리스트 반환
"""
import re

from playwright.async_api import Page

from config.settings import PAGE_LOAD_TIMEOUT
from src.utils.delay import delay_short
from src.utils.logger import setup_logger

logger = setup_logger("feed_collector")

# 네이버 모바일 이웃 새글 피드
FEED_URL = "https://m.blog.naver.com/FeedList.naver"

# 데스크톱 이웃 새글 피드 (대체)
FEED_URL_DESKTOP = "https://blog.naver.com/FeedList.naver"


async def collect_feed_posts(
    page: Page,
    my_blog_ids: set[str] | None = None,
    max_posts: int = 20,
) -> list[dict]:
    """
    이웃 새글 피드에서 최신 게시물 수집.

    Args:
        page: Playwright 페이지
        my_blog_ids: 내 블로그 ID 셋 (자기 글 제외용)
        max_posts: 최대 수집 게시물 수

    Returns:
        [{"blog_id": str, "log_no": str, "title": str, "url": str}, ...]
    """
    my_ids = my_blog_ids or set()

    # 모바일 피드 접속 시도 → 실패 시 데스크톱
    for feed_url in [FEED_URL, FEED_URL_DESKTOP]:
        try:
            await page.goto(feed_url, timeout=PAGE_LOAD_TIMEOUT)
            await page.wait_for_load_state("domcontentloaded", timeout=PAGE_LOAD_TIMEOUT)
            await delay_short()
            break
        except Exception as e:
            logger.warning(f"피드 페이지 로드 실패 ({feed_url}): {e}")
    else:
        logger.error("이웃 새글 피드 접속 실패")
        return []

    # 피드 파싱 — 여러 셀렉터 시도 (네이버 구조 변경 대비)
    posts = await _parse_feed(page, my_ids, max_posts)

    if not posts:
        logger.info("이웃 새글 피드에서 게시물을 찾지 못했습니다")

    return posts


async def _parse_feed(
    page: Page,
    my_blog_ids: set[str],
    max_posts: int,
) -> list[dict]:
    """피드 페이지에서 게시물 목록 파싱."""
    results: list[dict] = []

    # 방법 1: 링크에서 blog_id + logNo 추출
    links = await page.evaluate("""() => {
        const links = document.querySelectorAll('a[href*="blog.naver.com"]');
        return [...links].map(a => ({
            href: a.href || '',
            text: (a.textContent || '').trim().slice(0, 100),
        })).filter(l => l.href && l.text.length > 5);
    }""")

    seen = set()
    post_pattern = re.compile(
        r"blog\.naver\.com/([a-zA-Z0-9_]+)/(\d{10,})"
    )

    for link in (links or []):
        if len(results) >= max_posts:
            break

        match = post_pattern.search(link["href"])
        if not match:
            continue

        blog_id = match.group(1)
        log_no = match.group(2)
        url = f"https://blog.naver.com/{blog_id}/{log_no}"

        # 중복 + 내 블로그 제외
        if url in seen:
            continue
        if blog_id in my_blog_ids:
            continue

        seen.add(url)
        results.append({
            "blog_id": blog_id,
            "log_no": log_no,
            "title": link["text"],
            "url": url,
        })

    if results:
        logger.info(f"이웃 새글 피드에서 {len(results)}개 게시물 수집")
    else:
        # 방법 2: iframe 내부 탐색 (네이버 블로그 iframe 구조)
        try:
            frames = page.frames
            for frame in frames:
                if "blog" not in (frame.url or ""):
                    continue
                frame_links = await frame.evaluate("""() => {
                    const links = document.querySelectorAll('a[href*="/"]');
                    return [...links].map(a => ({
                        href: a.href || '',
                        text: (a.textContent || '').trim().slice(0, 100),
                    })).filter(l => l.text.length > 5);
                }""")
                for link in (frame_links or []):
                    if len(results) >= max_posts:
                        break
                    match = post_pattern.search(link["href"])
                    if match:
                        blog_id = match.group(1)
                        log_no = match.group(2)
                        url = f"https://blog.naver.com/{blog_id}/{log_no}"
                        if url not in seen and blog_id not in my_blog_ids:
                            seen.add(url)
                            results.append({
                                "blog_id": blog_id,
                                "log_no": log_no,
                                "title": link["text"],
                                "url": url,
                            })
        except Exception as e:
            logger.debug(f"iframe 피드 파싱 실패: {e}")

    return results

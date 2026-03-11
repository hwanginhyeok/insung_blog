"""
타겟 블로거의 최근 게시물 URL + 제목 수집
"""
import random
import re
from datetime import datetime, timedelta

from playwright.async_api import Page

from config.settings import (
    BLOG_POST_LIST_URL,
    BLOG_POST_URL,
    MAX_POST_AGE_DAYS,
    PAGE_LOAD_TIMEOUT,
    POSTS_PER_BLOGGER_MAX,
    POSTS_PER_BLOGGER_MIN,
)
from src.utils.delay import delay_short
from src.utils.logger import logger


async def collect_posts(
    page: Page,
    blog_id: str,
    count: int | None = None,
) -> list[tuple[str, str]]:
    """
    blog_id의 최근 게시물 목록에서 (url, title) 튜플 리스트 반환.
    count가 None이면 POSTS_PER_BLOGGER_MIN~MAX 사이 랜덤.
    MAX_POST_AGE_DAYS 초과 게시물은 제외.
    비공개 블로그, 목록 파싱 실패 시 빈 리스트 반환.
    """
    if count is None:
        count = random.randint(POSTS_PER_BLOGGER_MIN, POSTS_PER_BLOGGER_MAX)

    list_url = BLOG_POST_LIST_URL.format(blog_id=blog_id)
    try:
        await page.goto(list_url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
        await delay_short()
    except Exception as e:
        logger.warning(f"게시물 목록 페이지 로드 실패 ({blog_id}): {e}")
        return []

    posts = await _parse_post_list(page, blog_id)

    if not posts:
        logger.info(f"{blog_id}: 게시물 없음 또는 비공개 블로그")
        return []

    # 날짜 필터: MAX_POST_AGE_DAYS 초과 게시물 제외
    cutoff = datetime.now() - timedelta(days=MAX_POST_AGE_DAYS)
    filtered: list[tuple[str, str]] = []
    for url, title, post_date in posts:
        if post_date is None or post_date >= cutoff:
            filtered.append((url, title))
        else:
            logger.debug(f"오래된 게시물 제외 ({post_date.date()}): {url[:60]}")

    if not filtered:
        logger.info(f"{blog_id}: 최근 {MAX_POST_AGE_DAYS}일 내 게시물 없음")
        return []

    selected = filtered[:count]
    logger.debug(f"{blog_id}: {len(selected)}개 게시물 수집")
    return selected


async def _parse_post_list(
    page: Page, blog_id: str
) -> list[tuple[str, str, datetime | None]]:
    """
    목록 페이지에서 (url, title, post_date) 파싱.
    post_date는 파악 불가 시 None.
    """
    results: list[tuple[str, str, datetime | None]] = []
    seen_urls: set[str] = set()

    frame = page.frame("mainFrame") or page

    # 셀렉터 우선순위: 신형 → 구형
    selectors = [
        ".blog_list .lli_subject a",
        ".post_list .post_title a",
        ".list_category a[href*='logNo']",
        ".post-item a[href*='logNo']",
        f"a[href*='/PostView.naver'], a[href*='blog.naver.com/{blog_id}/']",
    ]

    for selector in selectors:
        try:
            elements = await frame.query_selector_all(selector)
            if not elements:
                continue
            for el in elements:
                href = await el.get_attribute("href") or ""
                title = (await el.inner_text()).strip()
                url = _normalize_post_url(href, blog_id)
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                post_date = await _get_nearby_date(el)
                results.append((url, title or "제목 없음", post_date))
            if results:
                break
        except Exception:
            continue

    if not results:
        results = await _extract_by_log_no(frame, blog_id)

    # 최종 폴백: SPA/피드 형태 — HTML 소스에서 logNo 정규식 추출
    if not results:
        results = await _extract_log_nos_from_html(page, blog_id)

    return results


async def _get_nearby_date(el) -> datetime | None:
    """
    게시물 링크 요소 주변의 날짜 텍스트를 찾아 파싱.
    부모 컨테이너 내 날짜 셀렉터 순서대로 시도.
    파악 불가 시 None 반환.
    """
    date_selectors = [
        ".lli_date", ".post_date", ".date", "[class*='date']",
        ".se-publish-date", ".blog_date",
    ]
    try:
        parent = await el.evaluate_handle("el => el.closest('li, .lli, .post-item, .postItem, div[class*=\"item\"]')")
        if parent:
            for sel in date_selectors:
                try:
                    date_el = await parent.query_selector(sel)
                    if date_el:
                        text = (await date_el.inner_text()).strip()
                        parsed = _parse_date_text(text)
                        if parsed:
                            return parsed
                except Exception:
                    continue
    except Exception:
        pass
    return None


def _parse_date_text(text: str) -> datetime | None:
    """
    네이버 블로그 날짜 텍스트 → datetime 변환.
    지원 형식: "YYYY.MM.DD", "N일 전", "어제", "오늘", "N시간 전", "N분 전"
    """
    text = text.strip()
    now = datetime.now()
    today = now.date()

    if text in ("오늘", "방금"):
        return now
    if text == "어제":
        return datetime.combine(today - timedelta(days=1), datetime.min.time())

    m = re.match(r"(\d+)분\s*전", text)
    if m:
        return now - timedelta(minutes=int(m.group(1)))

    m = re.match(r"(\d+)시간\s*전", text)
    if m:
        return now - timedelta(hours=int(m.group(1)))

    m = re.match(r"(\d+)일\s*전", text)
    if m:
        return datetime.combine(today - timedelta(days=int(m.group(1))), datetime.min.time())

    # YYYY.MM.DD 또는 YY.MM.DD
    m = re.match(r"(\d{2,4})\.(\d{1,2})\.(\d{1,2})", text)
    if m:
        year = int(m.group(1))
        if year < 100:
            year += 2000
        try:
            return datetime(year, int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    return None


async def _extract_by_log_no(frame, blog_id: str) -> list[tuple[str, str, datetime | None]]:
    """페이지 내 모든 링크에서 logNo 패턴으로 게시물 URL 추출"""
    results: list[tuple[str, str, datetime | None]] = []
    try:
        links = await frame.query_selector_all("a[href]")
        seen_log_nos: set[str] = set()
        for link in links:
            href = await link.get_attribute("href") or ""
            log_no = _extract_log_no(href, blog_id)
            if log_no and log_no not in seen_log_nos:
                seen_log_nos.add(log_no)
                url = BLOG_POST_URL.format(blog_id=blog_id, log_no=log_no)
                title = (await link.inner_text()).strip() or "제목 없음"
                post_date = await _get_nearby_date(link)
                results.append((url, title, post_date))
    except Exception as e:
        logger.warning(f"logNo 추출 실패 ({blog_id}): {e}")
    return results


async def _extract_log_nos_from_html(
    page: Page, blog_id: str
) -> list[tuple[str, str, datetime | None]]:
    """
    페이지 HTML 소스에서 logNo 정규식 추출 (SPA/피드 형태 대응).
    네이버 블로그가 mainFrame iframe 없이 렌더링하는 새 형식에 대응.
    """
    results: list[tuple[str, str, datetime | None]] = []
    try:
        content = await page.content()
        # logNo=숫자 또는 "logNo":"숫자" 패턴
        pattern1 = re.findall(r'"logNo"\s*:\s*"?(\d{9,})"?', content)
        # /blog_id/숫자 패턴
        pattern2 = re.findall(rf"/{re.escape(blog_id)}/(\d{{9,}})", content)
        all_nos = list(dict.fromkeys(pattern1 + pattern2))  # 중복 제거, 순서 유지

        for log_no in all_nos:
            url = BLOG_POST_URL.format(blog_id=blog_id, log_no=log_no)
            results.append((url, "제목 없음", None))

        if results:
            logger.debug(f"HTML 소스에서 logNo {len(results)}개 추출 ({blog_id})")
    except Exception as e:
        logger.warning(f"HTML logNo 추출 실패 ({blog_id}): {e}")

    return results


def _normalize_post_url(href: str, blog_id: str) -> str:
    """다양한 링크 형식을 표준 게시물 URL로 정규화"""
    if not href:
        return ""

    # 이미 완전한 URL — blog_id 뒤에 숫자형 logNo가 있어야 유효한 게시물
    if href.startswith("http"):
        if blog_id in href and re.search(rf"/{re.escape(blog_id)}/\d{{6,}}", href):
            return href
        return ""

    # 상대 경로: /blog_id/logNo 형태 — 비게시물 경로는 제외
    match = re.search(rf"/{re.escape(blog_id)}/(\w+)", href)
    if match:
        segment = match.group(1)
        if segment.isdigit() and len(segment) >= 6:
            return BLOG_POST_URL.format(blog_id=blog_id, log_no=segment)
        return ""  # postwrite, prologue 등 비게시물 경로

    # logNo 파라미터 방식
    match = re.search(r"logNo=(\d+)", href)
    if match:
        return BLOG_POST_URL.format(blog_id=blog_id, log_no=match.group(1))

    return ""


def _extract_log_no(href: str, blog_id: str) -> str:
    """URL에서 logNo(게시물 번호) 추출"""
    match = re.search(rf"/{re.escape(blog_id)}/(\d{{6,}})", href)
    if match:
        return match.group(1)
    match = re.search(r"logNo=(\d{6,})", href)
    if match:
        return match.group(1)
    return ""

"""
내 블로그에 댓글을 달아준 사람들의 블로그 ID 수집

흐름:
  1차: admin.blog.naver.com/comment 페이지 파싱
  폴백: 모바일 Playwright로 내 게시물 댓글 영역 직접 파싱
    (데스크톱 cbox JS 미로드 문제 대응 — 2026-03 확인)
"""
import asyncio
import re
from urllib.parse import parse_qs, urlparse

from playwright.async_api import Page

from config.settings import (
    BLOG_COMMENT_ADMIN_URL,
    COMMENT_ADMIN_MAX_PAGES,
    COMMENT_LOAD_WAIT,
    MOBILE_BLOG_POST_URL,
    MOBILE_UA,
    MOBILE_VIEWPORT,
    PAGE_LOAD_TIMEOUT,
)
from src.utils.delay import delay_short
from src.utils.logger import logger


async def collect_commenters(page: Page, my_blog_id: str) -> list[str]:
    """
    내 블로그 댓글 작성자 blog_id 목록 반환 (중복 제거, 자기 자신 제외)
    """
    blog_ids = await _collect_from_admin(page, my_blog_id)

    if not blog_ids:
        logger.info("관리자 페이지 파싱 실패 — 폴백: 게시물 직접 방문")
        blog_ids = await _collect_from_posts_fallback(page, my_blog_id)

    # 자기 자신 제거 + 중복 제거 (순서 유지)
    seen: set[str] = set()
    result: list[str] = []
    for bid in blog_ids:
        if bid and bid != my_blog_id and bid not in seen:
            seen.add(bid)
            result.append(bid)

    logger.info(f"수집된 댓글 작성자: {len(result)}명")
    return result


async def _collect_from_admin(page: Page, my_blog_id: str) -> list[str]:
    """
    admin.blog.naver.com/{my_blog_id}/comment 에서 최대 3페이지 파싱
    주의: 네이버 관리자 URL 형식이 변경될 수 있어 404 시 빠르게 포기.
    """
    blog_ids: list[str] = []
    base_url = BLOG_COMMENT_ADMIN_URL.format(blog_id=my_blog_id)

    for page_no in range(1, COMMENT_ADMIN_MAX_PAGES + 1):
        url = f"{base_url}?page={page_no}"
        try:
            resp = await page.goto(url, timeout=PAGE_LOAD_TIMEOUT)
            # 404 또는 리다이렉트 → 관리자 URL 폐기된 것으로 판단
            if resp and resp.status == 404:
                logger.debug(f"관리자 댓글 URL 404 — 관리자 접근 건너뜀")
                return []
            # 로그인 페이지로 리다이렉트된 경우
            if "nidlogin" in page.url or "login" in page.url:
                logger.debug("관리자 페이지 → 로그인 리다이렉트 — 건너뜀")
                return []
            # "사라졌거나" 에러 페이지 감지
            content = await page.content()
            if "사라졌거나" in content or "찾을 수 없" in content:
                logger.debug("관리자 댓글 페이지 없음 (URL 변경) — 건너뜀")
                return []

            await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
            await delay_short()

            # 댓글 작성자 링크 — 블로그 ID 추출
            links = await page.query_selector_all(
                "a[href*='blog.naver.com'], a[href*='blogId=']"
            )
            page_ids: list[str] = []
            for link in links:
                href = await link.get_attribute("href") or ""
                bid = _extract_blog_id_from_url(href)
                if bid:
                    page_ids.append(bid)

            if not page_ids:
                logger.debug(f"페이지 {page_no}: 댓글 작성자 없음 — 중단")
                break

            blog_ids.extend(page_ids)
            logger.debug(f"관리자 페이지 {page_no}: {len(page_ids)}명 수집")

        except Exception as e:
            logger.warning(f"관리자 페이지 {page_no} 파싱 오류: {e}")
            break

    return blog_ids


async def _collect_from_posts_fallback(page: Page, my_blog_id: str) -> list[str]:
    """
    모바일 Playwright로 내 최근 게시물의 댓글 작성자 추출.

    데스크톱 cbox JS가 headless에서 로드되지 않는 문제 대응.
    모바일 페이지(m.blog.naver.com)에서는 댓글 버튼 클릭 후 정상 로드됨.

    흐름:
      1. 데스크톱 페이지에서 게시물 목록(logNo) 수집
      2. 모바일 컨텍스트 생성 → 각 게시물 방문
      3. 댓글 버튼 클릭 → a.u_cbox_name에서 blogId 추출
    """
    from src.collectors.post_collector import collect_posts

    blog_ids: list[str] = []
    posts = await collect_posts(page, my_blog_id, count=5)

    if not posts:
        return []

    # 모바일 컨텍스트 생성 (기존 브라우저 재사용)
    browser = page.context.browser
    if not browser:
        logger.warning("브라우저 인스턴스 없음 — 모바일 폴백 불가")
        return []

    mobile_ctx = await browser.new_context(
        user_agent=MOBILE_UA,
        viewport=MOBILE_VIEWPORT,
        locale="ko-KR",
    )
    mobile_page = await mobile_ctx.new_page()

    try:
        for post_url, _title in posts:
            log_no = _extract_log_no_from_post_url(post_url)
            if not log_no:
                continue

            mobile_url = MOBILE_BLOG_POST_URL.format(
                blog_id=my_blog_id, log_no=log_no,
            )

            try:
                await mobile_page.goto(mobile_url, timeout=PAGE_LOAD_TIMEOUT)
                await mobile_page.wait_for_load_state(
                    "domcontentloaded", timeout=PAGE_LOAD_TIMEOUT,
                )
                await asyncio.sleep(3)

                # 댓글 버튼 클릭 (lazy-load 트리거)
                comment_btn = await mobile_page.query_selector(
                    '[class*="comment_btn"], a._commentCount'
                )
                if not comment_btn:
                    logger.debug(f"댓글 버튼 없음 — 건너뜀: {mobile_url}")
                    continue

                await comment_btn.click()
                await asyncio.sleep(COMMENT_LOAD_WAIT)

                # 댓글 박스에서 블로그 ID 추출
                boxes = await mobile_page.query_selector_all(".u_cbox_comment_box")
                post_ids: list[str] = []
                for box in boxes:
                    name_link = await box.query_selector("a.u_cbox_name")
                    if not name_link:
                        continue
                    href = await name_link.get_attribute("href") or ""
                    bid = _extract_blog_id_from_url(href)
                    if bid:
                        post_ids.append(bid)

                blog_ids.extend(post_ids)
                logger.debug(
                    f"모바일 댓글 추출: {len(post_ids)}명 "
                    f"(댓글 {len(boxes)}개, {mobile_url})"
                )

            except Exception as e:
                logger.warning(f"모바일 댓글 추출 오류 ({mobile_url}): {e}")

    finally:
        await mobile_ctx.close()

    return blog_ids


def _extract_log_no_from_post_url(url: str) -> str:
    """게시물 URL에서 logNo 추출"""
    match = re.search(r"/(\d{9,})", url)
    if match:
        return match.group(1)
    match = re.search(r"logNo=(\d+)", url)
    if match:
        return match.group(1)
    return ""


def _extract_blog_id_from_url(url: str) -> str:
    """
    다양한 형식의 네이버 블로그 URL에서 blog_id 추출
    - https://blog.naver.com/some_id/12345
    - https://blog.naver.com/some_id
    - ?blogId=some_id
    """
    if not url:
        return ""
    parsed = urlparse(url)

    # 쿼리 파라미터 방식
    qs = parse_qs(parsed.query)
    if "blogId" in qs:
        return qs["blogId"][0]

    # 경로 방식 (blog.naver.com/{blog_id}/...)
    if "blog.naver.com" in parsed.netloc:
        parts = [p for p in parsed.path.split("/") if p]
        if parts:
            # 숫자만으로 된 건 logNo이므로 제외
            bid = parts[0]
            if not bid.isdigit():
                return bid

    return ""

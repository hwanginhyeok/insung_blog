"""블로그 관리자 페이지 + 게시물 목록 디버그"""
import asyncio, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv; load_dotenv()
import os
from playwright.async_api import async_playwright
from config.settings import COOKIES_PATH, PAGE_LOAD_TIMEOUT

BLOG_ID = os.environ["MY_BLOG_ID"]

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        # 쿠키 로드
        with open(COOKIES_PATH) as f:
            await context.add_cookies(json.load(f))

        page = await context.new_page()

        # 1. www.naver.com — 로그인 상태 확인
        await page.goto("https://www.naver.com", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(2)
        await page.screenshot(path="debug_naver_main.png")
        print(f"[네이버 메인] URL: {page.url}")

        # 2. 관리자 댓글 페이지
        admin_url = f"https://admin.blog.naver.com/{BLOG_ID}/comment"
        await page.goto(admin_url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(2)
        await page.screenshot(path="debug_admin_comment.png")
        print(f"[관리자 댓글] URL: {page.url}")

        # 3. 게시물 목록
        post_url = f"https://blog.naver.com/PostList.naver?blogId={BLOG_ID}&categoryNo=0"
        await page.goto(post_url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(2)
        await page.screenshot(path="debug_post_list.png")
        print(f"[게시물 목록] URL: {page.url}")

        # 모든 링크 중 logNo 포함된 것 추출
        links = await page.query_selector_all("a[href]")
        post_links = []
        for link in links:
            href = await link.get_attribute("href") or ""
            if BLOG_ID in href and any(c.isdigit() for c in href[-10:]):
                text = (await link.inner_text()).strip()[:30]
                post_links.append(f"  {href[:80]}  [{text}]")
        print(f"게시물 링크 후보 {len(post_links)}개:")
        for l in post_links[:10]:
            print(l)

        await browser.close()

asyncio.run(main())

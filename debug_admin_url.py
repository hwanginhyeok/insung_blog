"""네이버 블로그 관리자 댓글 URL 탐색"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv; load_dotenv()
import os

from playwright.async_api import async_playwright
from config.settings import COOKIES_PATH, PAGE_LOAD_TIMEOUT

MY_BLOG_ID = os.environ["MY_BLOG_ID"]

CANDIDATES = [
    f"https://admin.blog.naver.com/{MY_BLOG_ID}/comment",
    f"https://admin.blog.naver.com/{MY_BLOG_ID}",
    f"https://blog.naver.com/{MY_BLOG_ID}/manage/comment",
    f"https://blog.naver.com/BlogCommentView.naver?blogId={MY_BLOG_ID}",
    f"https://blog.naver.com/CommentList.naver?blogId={MY_BLOG_ID}",
    f"https://blog.naver.com/{MY_BLOG_ID}/comment",
    f"https://manage.blog.naver.com/{MY_BLOG_ID}/comment",
]


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        if COOKIES_PATH.exists():
            with open(COOKIES_PATH) as f:
                await context.add_cookies(json.load(f))

        page = await context.new_page()

        for url in CANDIDATES:
            try:
                resp = await page.goto(url, timeout=15_000)
                await page.wait_for_load_state("domcontentloaded", timeout=10_000)
                status = resp.status if resp else "?"
                final_url = page.url
                html = await page.content()
                has_error = "사라졌거나" in html or "찾을 수 없" in html
                body_snippet = (await page.evaluate("() => document.body.innerText"))[:80].replace('\n', ' ')
                mark = "✓" if not has_error and status == 200 else "✗"
                print(f"{mark} [{status}] {url}")
                print(f"   → {final_url[:70]}")
                print(f"   body: {body_snippet}")
            except Exception as e:
                print(f"✗ [ERR] {url}")
                print(f"   {str(e)[:60]}")

        await browser.close()


asyncio.run(main())

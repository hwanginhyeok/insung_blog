"""
관리자 페이지 + 게시물 목록 HTML 구조 심층 분석
"""
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv; load_dotenv()
import os

from playwright.async_api import async_playwright
from config.settings import COOKIES_PATH, PAGE_LOAD_TIMEOUT

MY_BLOG_ID = os.environ["MY_BLOG_ID"]


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="ko-KR",
        )
        if COOKIES_PATH.exists():
            with open(COOKIES_PATH) as f:
                await context.add_cookies(json.load(f))

        page = await context.new_page()

        # ── 1. 관리자 댓글 페이지 HTML 분석 ───────────────────
        admin_url = f"https://admin.blog.naver.com/{MY_BLOG_ID}/comment"
        print(f"[1] 관리자 댓글 페이지")
        await page.goto(admin_url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(3)

        print(f"    URL: {page.url}")
        print(f"    frames: {[f.name for f in page.frames]}")

        # 전체 HTML 저장
        html = await page.content()
        with open("debug_admin_html.txt", "w", encoding="utf-8") as f:
            f.write(html)
        print(f"    HTML 길이: {len(html)}")
        print(f"    HTML 미리보기: {html[:500]}")

        # 댓글/작성자 관련 키워드
        kws = ["blogId", "blog.naver.com", "nickname", "commenter", "댓글", "작성자", "authorId"]
        for kw in kws:
            cnt = html.count(kw)
            if cnt:
                print(f"    '{kw}': {cnt}회")

        # ── 2. 게시물 목록 HTML 분석 ──────────────────────────
        post_list_url = f"https://blog.naver.com/PostList.naver?blogId={MY_BLOG_ID}&categoryNo=0"
        print(f"\n[2] 게시물 목록 페이지")
        await page.goto(post_list_url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(2)

        print(f"    URL: {page.url}")
        frames_info = [(f.name, f.url[:60]) for f in page.frames]
        print(f"    frames ({len(page.frames)}개):")
        for name, url in frames_info:
            print(f"      name={name!r}  url={url}")

        # mainFrame 찾기
        main_frame = None
        for f in page.frames:
            if "PostList" in f.url or "PostView" in f.url or MY_BLOG_ID in f.url:
                main_frame = f
                print(f"    → 사용 frame: name={f.name!r}  url={f.url[:60]}")
                break
        if main_frame is None:
            main_frame = page.frame("mainFrame") or page.main_frame
            print(f"    → 기본 frame 사용: name={main_frame.name!r}")

        html2 = await main_frame.content()
        print(f"    HTML 길이: {len(html2)}")

        # logNo 링크 탐색 (모든 a 태그)
        all_links = await main_frame.query_selector_all("a[href]")
        print(f"    전체 링크 수: {len(all_links)}")
        blog_links = []
        for link in all_links:
            href = await link.get_attribute("href") or ""
            if MY_BLOG_ID in href or re.search(r"logNo=\d+", href):
                text = (await link.inner_text()).strip()[:30]
                blog_links.append((href, text))
        print(f"    블로그 관련 링크: {len(blog_links)}개")
        for href, text in blog_links[:10]:
            print(f"      {href[:70]}  [{text}]")

        # 게시물 리스트 셀렉터 전수 점검
        print(f"\n    [셀렉터 점검]")
        test_selectors = [
            ".blog_list .lli_subject a",
            ".post_list .post_title a",
            ".list_category a[href*='logNo']",
            ".post-item a",
            f"a[href*='{MY_BLOG_ID}']",
            "a[href*='PostView']",
            "a[href*='logNo']",
            ".list_item a",
            ".item_title a",
            "[class*='title'] a",
        ]
        for sel in test_selectors:
            try:
                els = await main_frame.query_selector_all(sel)
                if els:
                    sample = await els[0].get_attribute("href") or ""
                    print(f"    ✓ {sel!r}: {len(els)}개  (sample: {sample[:50]})")
            except Exception as e:
                pass

        await browser.close()


asyncio.run(main())

"""
댓글 작성자 수집 디버그
1. 관리자 댓글 페이지 구조 확인
2. 실제 게시물 댓글창 구조 확인
"""
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
            print(f"쿠키 로드 완료 (blog: {MY_BLOG_ID})\n")

        page = await context.new_page()

        # ── 1. 관리자 댓글 페이지 ──────────────────────────────
        admin_url = f"https://admin.blog.naver.com/{MY_BLOG_ID}/comment"
        print(f"[1] 관리자 댓글 페이지: {admin_url}")
        await page.goto(admin_url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(2)
        await page.screenshot(path="debug_admin_comment.png")
        print(f"    최종 URL: {page.url}")
        print(f"    frame 수: {len(page.frames)}")

        # 페이지 내 모든 링크 중 blog.naver.com 포함 추출
        links = await page.query_selector_all("a[href*='blog.naver.com'], a[href*='blogId=']")
        print(f"    blog 링크 수: {len(links)}")
        for i, link in enumerate(links[:10]):
            href = await link.get_attribute("href") or ""
            text = (await link.inner_text()).strip()[:30]
            print(f"      [{i}] {href[:70]}  [{text}]")

        # 관리자 페이지가 로그인 화면으로 리다이렉트됐는지 확인
        if "login" in page.url.lower() or "nidlogin" in page.url.lower():
            print("    ⚠️  로그인 페이지로 리다이렉트됨!")
        elif "admin.blog.naver.com" not in page.url:
            print(f"    ⚠️  예상치 못한 URL로 리다이렉트: {page.url}")

        # ── 2. 게시물 목록 ────────────────────────────────────
        post_list_url = f"https://blog.naver.com/PostList.naver?blogId={MY_BLOG_ID}&categoryNo=0"
        print(f"\n[2] 게시물 목록: {post_list_url}")
        await page.goto(post_list_url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(2)

        # mainFrame 확인
        main_frame = page.frame("mainFrame") or page
        links = await main_frame.query_selector_all("a[href]")
        post_links = []
        for link in links:
            href = await link.get_attribute("href") or ""
            if MY_BLOG_ID in href:
                import re
                if re.search(r"/\d{6,}", href):
                    text = (await link.inner_text()).strip()[:40]
                    post_links.append((href, text))

        print(f"    게시물 링크 수: {len(post_links)}")
        for href, text in post_links[:5]:
            print(f"      {href[:70]}  [{text}]")

        # ── 3. 첫 번째 게시물 댓글 구조 확인 ──────────────────
        if post_links:
            import re
            first_href, first_title = post_links[0]
            # 완전한 URL 구성
            if first_href.startswith("http"):
                first_url = first_href
            else:
                m = re.search(rf"/{re.escape(MY_BLOG_ID)}/(\d+)", first_href)
                if m:
                    first_url = f"https://blog.naver.com/{MY_BLOG_ID}/{m.group(1)}"
                else:
                    first_url = first_href

            print(f"\n[3] 첫 번째 게시물 댓글 확인: {first_url}")
            await page.goto(first_url, timeout=PAGE_LOAD_TIMEOUT)
            await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
            await asyncio.sleep(3)
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(2)

            main_frame = page.frame("mainFrame") or page
            # 댓글 작성자 링크 수집 시도
            selectors = [
                ".u_cbox_nickname a",
                ".comment_nickname a",
                "a[href*='blog.naver.com']",
            ]
            for sel in selectors:
                try:
                    els = await main_frame.query_selector_all(sel)
                    if els:
                        print(f"    selector={sel!r}: {len(els)}개")
                        for el in els[:5]:
                            href = await el.get_attribute("href") or ""
                            text = (await el.inner_text()).strip()[:20]
                            print(f"      {href[:60]}  [{text}]")
                    else:
                        print(f"    selector={sel!r}: 0개")
                except Exception as e:
                    print(f"    selector={sel!r}: 오류 {e}")

            # 댓글 iframe 구조
            print("\n    [frame 구조]")
            for f in page.frames:
                url_lower = (f.url or "").lower()
                name_lower = (f.name or "").lower()
                if any(k in url_lower or k in name_lower for k in ["comment", "cbox"]):
                    print(f"      ✓ comment frame: name={f.name!r}  url={f.url[:70]}")

        await browser.close()
        print("\n완료. debug_admin_comment.png 저장됨.")


asyncio.run(main())

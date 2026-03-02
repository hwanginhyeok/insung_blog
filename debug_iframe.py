"""
특정 블로그 게시물의 iframe 구조를 덤프하는 디버그 스크립트
사용: python debug_iframe.py
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv; load_dotenv()

from playwright.async_api import async_playwright
from config.settings import COOKIES_PATH, PAGE_LOAD_TIMEOUT

# 점검할 게시물 URL들
TEST_URLS = [
    "https://blog.naver.com/hwag10000/221717922567",
    "https://blog.naver.com/hwag10000/221763442956",
]

TEXTAREA_SELECTORS = [
    ".u_cbox_write_wrap textarea",
    ".u_cbox_write textarea",
    ".comment_write_box textarea",
    "#cbox_module textarea",
    "textarea[placeholder*='댓글']",
    "textarea",
]


async def check_frame(frame, indent=""):
    name = frame.name or "(no name)"
    url = frame.url or "(no url)"
    child_count = len(frame.child_frames)

    has_ta = False
    for sel in TEXTAREA_SELECTORS:
        try:
            el = await frame.query_selector(sel)
            if el:
                has_ta = True
                break
        except Exception:
            pass

    print(f"{indent}├─ name={name!r:20s}  url={url[:70]}  textarea={has_ta}  children={child_count}")
    for cf in frame.child_frames:
        await check_frame(cf, indent + "│  ")


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
            print("쿠키 로드 완료\n")

        page = await context.new_page()

        for url in TEST_URLS:
            print(f"\n{'='*70}")
            print(f"URL: {url}")
            print('='*70)

            await page.goto(url, timeout=PAGE_LOAD_TIMEOUT)
            await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
            await asyncio.sleep(3)  # lazy-load 대기

            print(f"전체 frame 수: {len(page.frames)}")
            print("\n[Frame 트리]")
            await check_frame(page.main_frame)

            print("\n[전체 Frame URL 목록]")
            for i, f in enumerate(page.frames):
                print(f"  [{i}] name={f.name!r:20s}  url={f.url[:80]}")

            # 댓글 관련 키워드로 필터
            print("\n[comment/cbox 포함 Frame]")
            for f in page.frames:
                url_lower = (f.url or "").lower()
                name_lower = (f.name or "").lower()
                if any(k in url_lower or k in name_lower for k in ["comment", "cbox"]):
                    print(f"  ✓ name={f.name!r}  url={f.url}")

        await browser.close()


asyncio.run(main())

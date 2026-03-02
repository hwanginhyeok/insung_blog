"""
mainFrame 내부 댓글 구조 + 스크롤 후 상태 확인
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv; load_dotenv()

from playwright.async_api import async_playwright
from config.settings import COOKIES_PATH, PAGE_LOAD_TIMEOUT

TEST_URL = "https://blog.naver.com/hwag10000/221763442956"

COMMENT_KEYWORDS = [
    "cbox", "commentIframe", "u_cbox", "comment_write",
    "textarea", "댓글", "CommentList",
]


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

        await page.goto(TEST_URL, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)

        # 스크롤해서 lazy-load 트리거
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(3)
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(2)

        print(f"전체 frame 수 (스크롤 후): {len(page.frames)}")
        for i, f in enumerate(page.frames):
            print(f"  [{i}] name={f.name!r:25s}  url={f.url[:80]}")

        # mainFrame HTML에서 댓글 관련 키워드 찾기
        main_frame = page.frame("mainFrame")
        if main_frame:
            print("\n[mainFrame 내 댓글 관련 키워드 검색]")
            try:
                html = await main_frame.content()
                for kw in COMMENT_KEYWORDS:
                    count = html.lower().count(kw.lower())
                    if count:
                        print(f"  '{kw}': {count}회 등장")
            except Exception as e:
                print(f"  content() 오류: {e}")

            # iframe 요소 (DOM 내) 찾기
            print("\n[mainFrame 내 <iframe> 요소 목록]")
            try:
                iframes = await main_frame.query_selector_all("iframe")
                for iframe_el in iframes:
                    name = await iframe_el.get_attribute("name") or ""
                    src = await iframe_el.get_attribute("src") or ""
                    id_ = await iframe_el.get_attribute("id") or ""
                    print(f"  id={id_!r:20s}  name={name!r:20s}  src={src[:60]}")
            except Exception as e:
                print(f"  iframe 탐색 오류: {e}")

            # 댓글창이 댓글 작성 불가 상태인지 확인 (비공개, 비허용 등)
            print("\n[mainFrame 내 '댓글' 텍스트 포함 요소]")
            try:
                els = await main_frame.query_selector_all(
                    "[class*='comment'], [id*='comment'], [class*='cbox']"
                )
                print(f"  댓글 관련 클래스/id 요소: {len(els)}개")
                for el in els[:10]:
                    cls = await el.get_attribute("class") or ""
                    tag = await el.evaluate("el => el.tagName.toLowerCase()")
                    txt = (await el.inner_text()).strip()[:40]
                    print(f"    <{tag}> class={cls[:50]!r}  text={txt!r}")
            except Exception as e:
                print(f"  오류: {e}")

        await browser.close()


asyncio.run(main())

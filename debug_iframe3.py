"""
mainFrame의 about:blank 하위 iframe들 + textarea 직접 접근 확인
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

        # 스크롤 → lazy-load 트리거
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(3)

        main_frame = page.frame("mainFrame")
        if not main_frame:
            print("mainFrame 없음")
            return

        # 1. mainFrame의 about:blank 자식 iframe들 내부 HTML 확인
        print("[about:blank iframe 내부 내용 확인]")
        for i, cf in enumerate(main_frame.child_frames):
            try:
                html = await cf.content()
                has_ta = "textarea" in html.lower()
                has_cbox = "cbox" in html.lower()
                print(f"  [{i}] name={cf.name!r:25s}  len={len(html):6d}  textarea={has_ta}  cbox={has_cbox}")
                if has_ta or has_cbox:
                    print(f"       → html snippet: {html[:200]}")
            except Exception as e:
                print(f"  [{i}] name={cf.name!r:25s}  content() 오류: {e}")

        # 2. mainFrame에서 textarea 직접 query
        print("\n[mainFrame textarea 직접 query]")
        for sel in ["textarea", ".u_cbox_write textarea", ".u_cbox_write_wrap textarea", "#cbox_module_wai_u_cbox_write"]:
            try:
                el = await main_frame.query_selector(sel)
                print(f"  {sel!r:45s}: {'찾음 ✓' if el else '없음'}")
                if el:
                    is_visible = await el.is_visible()
                    box = await el.bounding_box()
                    print(f"    visible={is_visible}  box={box}")
            except Exception as e:
                print(f"  {sel!r:45s}: 오류 → {e}")

        # 3. mainFrame JS로 textarea 확인
        print("\n[mainFrame JS querySelector 결과]")
        try:
            result = await main_frame.evaluate("""
                () => {
                    const ta = document.querySelector('textarea');
                    if (!ta) return 'textarea 없음';
                    return {
                        tagName: ta.tagName,
                        id: ta.id,
                        className: ta.className,
                        visible: ta.offsetParent !== null,
                        placeholder: ta.placeholder,
                    };
                }
            """)
            print(f"  {result}")
        except Exception as e:
            print(f"  JS 오류: {e}")

        # 4. u_cbox 구조 확인 (댓글 비허용 여부)
        print("\n[댓글 허용 여부 확인]")
        try:
            result = await main_frame.evaluate("""
                () => {
                    const noComment = document.querySelector('.u_cbox_notice_no_comment, .blog_write_unable, [class*="no_comment"]');
                    const writeArea = document.querySelector('.u_cbox_write_wrap, .u_cbox_write');
                    return {
                        no_comment_msg: noComment ? noComment.innerText.trim().slice(0, 80) : null,
                        write_area_exists: !!writeArea,
                        write_area_html: writeArea ? writeArea.innerHTML.slice(0, 300) : null,
                    };
                }
            """)
            print(f"  no_comment_msg: {result.get('no_comment_msg')}")
            print(f"  write_area_exists: {result.get('write_area_exists')}")
            print(f"  write_area_html: {result.get('write_area_html', '')[:200]}")
        except Exception as e:
            print(f"  JS 오류: {e}")

        await browser.close()


asyncio.run(main())

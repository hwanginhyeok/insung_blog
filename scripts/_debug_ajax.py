"""AJAX 엔드포인트 JSON 구조 분석"""
import asyncio
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from src.utils.browser import create_browser

# 네이버 JSON의 비표준 이스케이프 수정
def _fix_naver_json(text: str) -> str:
    """네이버 AJAX 응답의 비표준 이스케이프 수정"""
    # 유효하지 않은 \이스케이프를 \\로 변환 (유효한 것: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX)
    return re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', text)


async def check():
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser, ctx, page = await create_browser(pw, headless=True)
        try:
            for pg_num in [1, 2, 3]:
                url = (
                    f"https://blog.naver.com/PostTitleListAsync.naver"
                    f"?blogId=youyoubear0517&viewdate=&currentPage={pg_num}"
                    f"&categoryNo=0&parentCategoryNo=0&countPerPage=30"
                )
                await page.goto(url, timeout=30000)
                await asyncio.sleep(1.5)

                text = await page.evaluate(
                    "() => document.querySelector('pre')?.textContent || document.body.innerText"
                )
                fixed = _fix_naver_json(text)
                data = json.loads(fixed)

                post_list = data.get("postList", [])
                print(f"\n=== 페이지 {pg_num} ===")
                print(f"resultCode: {data['resultCode']}")
                print(f"postList 수: {len(post_list)}")
                print(f"응답 키: {list(data.keys())}")

                if pg_num == 1 and post_list:
                    p = post_list[0]
                    print(f"게시물 키: {list(p.keys())}")

                for p in post_list[:5]:
                    title = unquote(p.get("title", ""))
                    print(f"  logNo={p['logNo']}, cat={p.get('categoryNo')}, date={p.get('addDate')}, title={title[:40]}")

                if not post_list:
                    print("  (빈 페이지)")
                    break

        finally:
            await browser.close()


asyncio.run(check())

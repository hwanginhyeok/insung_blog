"""
관리자 페이지(SPA) 컨텐츠 로드 대기 + 게시물 실제 존재 여부 확인
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

        page = await context.new_page()

        # ── 1. 관리자 SPA 충분히 기다리기 ────────────────────
        admin_url = f"https://admin.blog.naver.com/{MY_BLOG_ID}/comment"
        print(f"[1] 관리자 댓글 SPA — 충분 대기 후 내용 확인")
        await page.goto(admin_url, timeout=PAGE_LOAD_TIMEOUT)

        # SPA는 networkidle 후에도 JS 렌더링 시간 필요
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(5)

        html = await page.content()
        print(f"    HTML 길이(5초 후): {len(html)}")

        # 댓글 데이터 관련 키워드
        for kw in ["blogId", "commentCount", "nickname", "authorId", "댓글", "작성자", "blogNm"]:
            cnt = html.count(kw)
            if cnt:
                print(f"    '{kw}': {cnt}회")

        # 화면에 보이는 텍스트
        try:
            body_text = await page.evaluate("() => document.body.innerText")
            print(f"\n    body 텍스트 (첫 500자):\n    {body_text[:500]}")
        except Exception as e:
            print(f"    body text 오류: {e}")

        await page.screenshot(path="debug_admin_spa.png")

        # ── 2. 내 블로그 실제 방문 (비로그인 뷰) ─────────────
        my_blog_url = f"https://blog.naver.com/{MY_BLOG_ID}"
        print(f"\n[2] 내 블로그 직접 방문: {my_blog_url}")
        await page.goto(my_blog_url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(2)

        print(f"    최종 URL: {page.url}")
        frames_info = [(f.name, f.url[:60]) for f in page.frames]
        print(f"    frames: {frames_info[:5]}")

        # mainFrame이 있는 경우 게시물 링크 찾기
        import re
        main_frame = page.frame("mainFrame") or page.main_frame
        html2 = await main_frame.content()
        post_nos = re.findall(rf"/{re.escape(MY_BLOG_ID)}/(\d{{6,}})", html2)
        unique_nos = list(dict.fromkeys(post_nos))
        print(f"    게시물 번호 발견: {unique_nos[:10]}")
        if not unique_nos:
            print("    → 블로그에 게시물이 없거나 비공개 처리된 것 같습니다")

        # ── 3. 새 형식 API로 게시물 목록 확인 ─────────────────
        # 네이버 블로그 API (로그인 필요)
        api_url = f"https://blog.naver.com/PostTitleListAsync.naver?blogId={MY_BLOG_ID}&currentPage=1&countPerPage=10&categoryNo=0&activeOnly=true"
        print(f"\n[3] 게시물 API 호출")
        await page.goto(api_url, timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(2)
        try:
            body = await page.evaluate("() => document.body.innerText")
            print(f"    API 응답 (200자): {body[:200]}")
        except Exception as e:
            print(f"    오류: {e}")

        await browser.close()


asyncio.run(main())

"""로그인 디버그: 스크린샷 저장"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv; load_dotenv()
import os
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        page = await context.new_page()
        await page.goto("https://nid.naver.com/nidlogin.login", timeout=30000)
        await asyncio.sleep(1)

        # 스크린샷 1: 로그인 전
        await page.screenshot(path="debug_1_before.png")
        print("스크린샷 1 저장 (로그인 전)")

        # ID 입력
        await page.locator("#id").click()
        await asyncio.sleep(0.3)
        await page.locator("#id").press_sequentially(os.environ["NAVER_ID"], delay=80)
        await asyncio.sleep(0.5)

        # PW 입력
        await page.locator("#pw").click()
        await asyncio.sleep(0.3)
        await page.locator("#pw").press_sequentially(os.environ["NAVER_PW"], delay=80)
        await asyncio.sleep(0.5)

        # 스크린샷 2: 입력 후
        await page.screenshot(path="debug_2_filled.png")
        print("스크린샷 2 저장 (입력 후)")

        # 버튼 클릭
        btn = await page.query_selector(".btn_login")
        print(f"버튼 발견: {btn is not None}")
        if btn:
            await btn.click()
        else:
            # 엔터키로 폴백
            await page.keyboard.press("Enter")

        await asyncio.sleep(4)

        # 스크린샷 3: 클릭 후
        await page.screenshot(path="debug_3_after.png")
        print(f"현재 URL: {page.url}")
        print("스크린샷 3 저장 (클릭 후)")

        # 페이지 텍스트에서 오류 메시지 찾기
        content = await page.content()
        for keyword in ["오류", "error", "캡차", "captcha", "잘못", "확인", "2단계"]:
            if keyword.lower() in content.lower():
                print(f"  → 키워드 발견: '{keyword}'")

        await browser.close()

asyncio.run(main())

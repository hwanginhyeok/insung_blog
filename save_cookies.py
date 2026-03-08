"""
네이버 수동 로그인 → 쿠키 저장 도우미

사용법:
  python save_cookies.py

브라우저 창이 열리면 직접 네이버에 로그인하세요.
로그인 완료 후 Enter를 누르면 쿠키가 저장됩니다.
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv()

from playwright.async_api import async_playwright
from config.settings import COOKIES_PATH


async def main():
    print("=" * 50)
    print("  네이버 쿠키 저장 도우미")
    print("=" * 50)
    print()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=False,   # 브라우저 창 표시
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/133.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="ko-KR",
        )
        page = await context.new_page()
        await page.goto("https://nid.naver.com/nidlogin.login")

        print("▶ 브라우저가 열렸습니다.")
        print("  1. 네이버에 로그인해 주세요 (ID/PW 입력 또는 QR코드)")
        print("  2. 로그인 완료되면 자동으로 쿠키가 저장됩니다 (최대 3분 대기)")
        print()

        # 로그인 완료 감지: NID_AUT 쿠키가 생기거나 www.naver.com으로 이동되면 성공
        timeout_seconds = 300
        interval = 2
        logged_in = False

        for _ in range(timeout_seconds // interval):
            await asyncio.sleep(interval)
            current_url = page.url
            cookies = await context.cookies()
            naver_auth = [c for c in cookies if c.get("name") == "NID_AUT"]
            if naver_auth or current_url.startswith("https://www.naver.com"):
                logged_in = True
                break
            # 진행상황 표시 (10초마다)
            pass

        current_url = page.url
        print(f"\n현재 URL: {current_url}")

        if not logged_in:
            print("⚠ 3분 내에 로그인이 감지되지 않았습니다.")
            await browser.close()
            return

        # 쿠키 저장
        COOKIES_PATH.parent.mkdir(parents=True, exist_ok=True)
        cookies = await context.cookies()
        naver_cookies = [c for c in cookies if "naver.com" in c.get("domain", "")]

        with open(COOKIES_PATH, "w", encoding="utf-8") as f:
            json.dump(naver_cookies, f, ensure_ascii=False, indent=2)

        print(f"\n✓ 쿠키 저장 완료! ({len(naver_cookies)}개)")
        print(f"  저장 위치: {COOKIES_PATH}")
        print()
        print("이제 다음 명령으로 실행하세요:")
        print("  python main.py --run-once --dry-run")
        print()

        await browser.close()


asyncio.run(main())

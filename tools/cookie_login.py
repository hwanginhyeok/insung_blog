#!/usr/bin/env python3
"""headed 브라우저로 네이버 로그인 → 쿠키 저장."""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

from playwright.async_api import async_playwright

USER_ID = "50c16052-77b3-4c33-b1d9-acecc23e4806"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        await page.goto("https://nid.naver.com/nidlogin.login", wait_until="domcontentloaded")
        print("네이버 로그인 페이지 열림 — VNC에서 로그인하세요")

        # NID_AUT 쿠키가 나타날 때까지 최대 5분 대기
        for i in range(300):
            await asyncio.sleep(1)
            cookies = await ctx.cookies()
            has_nid = any(c["name"] == "NID_AUT" for c in cookies)
            if has_nid:
                print(f"NID_AUT 감지! 쿠키 {len(cookies)}개")
                # Supabase에 저장
                from supabase import create_client
                sb = create_client(
                    os.environ["SUPABASE_URL"],
                    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
                )
                cookie_json = json.dumps(cookies, ensure_ascii=False)
                sb.table("bot_cookies").update(
                    {"cookie_data": cookie_json}
                ).eq("user_id", USER_ID).execute()
                print("쿠키 Supabase 저장 완료!")
                await asyncio.sleep(3)
                await browser.close()
                return
            if i % 30 == 0 and i > 0:
                print(f"대기 중... ({i}초)")

        print("타임아웃 — 로그인 감지 실패")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

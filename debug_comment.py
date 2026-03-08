"""Chrome 프로필로 네이버 쿠키 추출 (WSL, input 없이)"""
import asyncio
import json

from config.settings import COOKIES_PATH


async def main():
    from playwright.async_api import async_playwright

    chrome_exe = "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
    user_data = "/mnt/c/Users/gint pcd/AppData/Local/Google/Chrome/User Data"

    print("=== Chrome 프로필로 쿠키 추출 ===")

    async with async_playwright() as pw:
        print("Chrome 시작 중...")
        context = await pw.chromium.launch_persistent_context(
            user_data_dir=user_data,
            executable_path=chrome_exe,
            headless=False,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
            viewport={"width": 1280, "height": 800},
            locale="ko-KR",
        )

        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto("https://www.naver.com", timeout=60000)
        await page.wait_for_load_state("domcontentloaded", timeout=60000)
        await asyncio.sleep(3)

        content = await page.content()
        logged_in = "로그아웃" in content
        print(f"네이버 메인 로그인: {logged_in}")

        # 쿠키 추출
        cookies = await context.cookies(
            ["https://www.naver.com", "https://nid.naver.com", "https://blog.naver.com"]
        )
        naver_cookies = [c for c in cookies if "naver.com" in c.get("domain", "")]
        has_auth = any(c["name"] == "NID_AUT" for c in naver_cookies)
        print(f"네이버 쿠키 {len(naver_cookies)}개 (NID_AUT: {'있음' if has_auth else '없음'})")

        # 블로그 댓글 시스템 확인
        print("\n댓글 시스템 확인 중...")
        await page.goto(
            "https://blog.naver.com/youyoubear0517/224194609798", timeout=60000
        )
        await page.wait_for_load_state("domcontentloaded", timeout=60000)
        await asyncio.sleep(4)

        frame = page.frame("mainFrame") or page.main_frame
        await frame.evaluate(
            """() => {
            const btn = document.querySelector('.btn_comment');
            if (btn) { btn.scrollIntoView({behavior: 'instant', block: 'center'}); btn.click(); }
        }"""
        )
        await asyncio.sleep(3)

        state = await frame.evaluate(
            """() => {
            const writeBox = document.querySelector('.u_cbox_write_box');
            const guide = document.querySelector('.u_cbox_guide');
            return {
                isLoggedOut: writeBox?.classList?.contains('u_cbox_type_logged_out'),
                isLoggedIn: writeBox?.classList?.contains('u_cbox_type_logged_in'),
                guideText: guide?.textContent?.trim()?.substring(0, 60),
            };
        }"""
        )
        print(f"댓글 시스템: {state}")

        # 쿠키 저장
        COOKIES_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(COOKIES_PATH, "w", encoding="utf-8") as f:
            json.dump(naver_cookies, f, ensure_ascii=False, indent=2)
        print(f"\n쿠키 저장: {COOKIES_PATH}")

        if state.get("isLoggedIn"):
            print("\n댓글 시스템 로그인 확인! 댓글 입력 테스트...")
            # 입력 테스트
            guide_result = await frame.evaluate(
                """() => {
                const guide = document.querySelector('.u_cbox_guide');
                if (guide) guide.click();
                return !!guide;
            }"""
            )
            await asyncio.sleep(1)

            input_el = await frame.query_selector(".u_cbox_text")
            if input_el:
                await input_el.click()
                await asyncio.sleep(0.5)
                await input_el.type("쿠키_테스트_입력", delay=50)
                await asyncio.sleep(0.5)
                text = await input_el.evaluate("e => e.textContent")
                print(f"입력 테스트 결과: '{text}'")
                # 지우기
                await input_el.evaluate("e => e.textContent = ''")
        else:
            print("\n댓글 시스템이 로그아웃 상태입니다.")

        await page.screenshot(path="/tmp/chrome_cookie_test.png")
        print("스크린샷: /tmp/chrome_cookie_test.png")

        await context.close()


asyncio.run(main())

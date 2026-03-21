"""댓글 영역 셀렉터 디버그 — 제출 버튼 DOM 확인용"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv()

from playwright.async_api import async_playwright
from src.utils.browser import create_browser
from src.auth.naver_login import ensure_login
from src.utils.logger import logger


# 테스트할 블로그 게시물 URL (아무 게시물이나)
TEST_URL = "https://blog.naver.com/skagusdl6354"


async def main():
    async with async_playwright() as pw:
        browser, context, page = await create_browser(pw, headless=True)
        try:
            # 로그인
            import os
            naver_id = os.getenv("NAVER_ID")
            naver_pw = os.getenv("NAVER_PW")
            if not naver_id or not naver_pw:
                logger.error("NAVER_ID/NAVER_PW 환경변수가 설정되지 않았습니다")
                return
            await ensure_login(context, page, naver_id, naver_pw)
            logger.info("로그인 완료")

            # 블로그 메인에서 최근 게시물 찾기
            await page.goto(TEST_URL, timeout=30000)
            await page.wait_for_load_state("domcontentloaded")
            await asyncio.sleep(3)

            # mainFrame 내 최근 게시물 링크 찾기
            frame = page.frame("mainFrame") or page.main_frame
            post_links = await frame.evaluate('''() => {
                const links = document.querySelectorAll('a[href*="logNo="], a[href*="/PostView"]');
                return Array.from(links).slice(0, 3).map(a => a.href);
            }''')

            if not post_links:
                # 직접 URL 시도
                post_links = [TEST_URL]

            post_url = post_links[0] if post_links else TEST_URL
            logger.info(f"테스트 게시물: {post_url}")

            # 게시물 접속
            await page.goto(post_url, timeout=30000)
            await page.wait_for_load_state("domcontentloaded")
            await asyncio.sleep(3)

            frame = page.frame("mainFrame") or page.main_frame

            # 댓글 열기 버튼 클릭 시도
            comment_open_selectors = [
                ".btn_comment", "a.btn_comment", "#btn_comment_2",
                "[class*='comment']", "button[class*='comment']",
            ]
            for sel in comment_open_selectors:
                try:
                    btn = await frame.query_selector(sel)
                    if btn:
                        await btn.evaluate("e => e.click()")
                        logger.info(f"댓글 열기 버튼 클릭: {sel}")
                        await asyncio.sleep(3)
                        break
                except Exception:
                    continue

            # 댓글 영역 전체 DOM 덤프
            comment_dom = await frame.evaluate('''() => {
                // 댓글 영역 찾기
                const areas = document.querySelectorAll(
                    '.u_cbox_wrap, .u_cbox_content_wrap, [class*="cbox"], [class*="comment"]'
                );
                const result = [];

                // 버튼 요소 모두 찾기
                const allButtons = document.querySelectorAll('button, a.btn, [role="button"], input[type="submit"]');
                result.push("=== 모든 버튼 요소 ===");
                allButtons.forEach(btn => {
                    const classes = btn.className || '';
                    const text = btn.textContent?.trim()?.substring(0, 50) || '';
                    const type = btn.getAttribute('type') || '';
                    const tag = btn.tagName;
                    if (classes.includes('cbox') || classes.includes('upload') ||
                        classes.includes('comment') || classes.includes('submit') ||
                        classes.includes('register') || classes.includes('write') ||
                        text.includes('등록') || text.includes('작성') || text.includes('게시')) {
                        result.push(`  ${tag} class="${classes}" type="${type}" text="${text}" visible=${btn.offsetParent !== null}`);
                    }
                });

                // 제출 관련 셀렉터 직접 검색
                result.push("\\n=== 제출 버튼 셀렉터 검색 ===");
                const submitSelectors = [
                    '.u_cbox_btn_upload',
                    'button.u_cbox_btn_upload',
                    '.u_cbox_write_wrap button[type="submit"]',
                    '.btn_comment_write',
                    'button[class*="upload"]',
                    'button[class*="register"]',
                    'button[class*="submit"]',
                    '.u_cbox_btn_register',
                    '.u_cbox_btn_submit',
                    'a.u_cbox_btn_upload',
                    'span.u_cbox_btn_upload',
                    '[class*="btn_upload"]',
                    '[class*="btn_register"]',
                    '[class*="btn_post"]',
                ];
                submitSelectors.forEach(sel => {
                    const el = document.querySelector(sel);
                    if (el) {
                        result.push(`  FOUND: ${sel} → tag=${el.tagName} class="${el.className}" text="${el.textContent?.trim()?.substring(0, 30)}" visible=${el.offsetParent !== null}`);
                    } else {
                        result.push(`  MISS:  ${sel}`);
                    }
                });

                // 댓글 입력창 확인
                result.push("\\n=== 댓글 입력창 검색 ===");
                const inputSelectors = [
                    '.u_cbox_text',
                    'div.u_cbox_text_mention',
                    '.u_cbox_write_wrap textarea',
                    'textarea[placeholder*="댓글"]',
                    '[contenteditable="true"]',
                ];
                inputSelectors.forEach(sel => {
                    const el = document.querySelector(sel);
                    if (el) {
                        result.push(`  FOUND: ${sel} → tag=${el.tagName} class="${el.className}" visible=${el.offsetParent !== null}`);
                    } else {
                        result.push(`  MISS:  ${sel}`);
                    }
                });

                // cbox 영역의 전체 HTML 구조 (버튼 주변)
                result.push("\\n=== u_cbox_write_wrap 내부 HTML ===");
                const writeWrap = document.querySelector('.u_cbox_write_wrap, [class*="cbox_write"]');
                if (writeWrap) {
                    result.push(writeWrap.innerHTML.substring(0, 2000));
                } else {
                    result.push("  write_wrap 없음");
                }

                return result.join("\\n");
            }''')

            print("\n" + "=" * 60)
            print("댓글 영역 DOM 분석 결과")
            print("=" * 60)
            print(comment_dom)
            print("=" * 60)

        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

#!/usr/bin/env python3
"""답글 버튼 클릭 후 대댓글 입력 영역 DOM 분석."""
import asyncio
import json
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)
from dotenv import load_dotenv
load_dotenv()

from playwright.async_api import async_playwright

URL = "https://m.blog.naver.com/zkk101earth/224237259952"
MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent=MOBILE_UA,
        )
        page = await ctx.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)

        # 댓글 영역 열기
        comment_btn = await page.query_selector('[class*="comment_btn"]')
        if comment_btn:
            await comment_btn.click()
            await page.wait_for_timeout(5000)

        # 첫 번째 댓글의 "답글" 버튼 클릭
        reply_btn = await page.query_selector(
            'a.u_cbox_btn_reply[data-action="reply#toggle"]'
        )
        if not reply_btn:
            print("답글 버튼 못 찾음")
            await browser.close()
            return

        comment_no = await reply_btn.get_attribute("data-param")
        print(f"답글 버튼 발견 (commentNo: {comment_no}) — 클릭")
        await reply_btn.click()
        await page.wait_for_timeout(3000)

        # 클릭 후 reply_area 분석
        result = await page.evaluate("""() => {
            const res = {};

            // 1. reply_area 표시 상태
            const areas = document.querySelectorAll('.u_cbox_reply_area');
            res.reply_areas = [...areas].map(a => ({
                display: a.style.display,
                html: a.outerHTML?.substring(0, 3000),
                childCount: a.children?.length,
            }));

            // 2. 새로 나타난 입력 영역
            const inputs = document.querySelectorAll(
                '.u_cbox_text, [contenteditable="true"], textarea'
            );
            res.input_areas = [...inputs].map(i => ({
                tag: i.tagName,
                class: i.className?.substring?.(0, 100),
                contentEditable: i.contentEditable,
                parent_class: i.parentElement?.className?.substring?.(0, 100),
                grandparent_class: i.parentElement?.parentElement?.className?.substring?.(0, 100),
                visible: i.offsetParent !== null,
                rect: (() => {
                    const r = i.getBoundingClientRect();
                    return { top: r.top, left: r.left, width: r.width, height: r.height };
                })(),
            }));

            // 3. 제출 버튼 (답글용)
            const submitBtns = document.querySelectorAll(
                '.u_cbox_btn_upload, button[class*="upload"], button[class*="submit"]'
            );
            res.submit_buttons = [...submitBtns].map(b => ({
                tag: b.tagName,
                class: b.className?.substring?.(0, 100),
                text: b.textContent?.trim()?.substring(0, 30),
                visible: b.offsetParent !== null,
                parent_class: b.parentElement?.className?.substring?.(0, 100),
                disabled: b.disabled,
            }));

            // 4. write_wrap 영역 (답글 입력 포함)
            const wraps = document.querySelectorAll('.u_cbox_write_wrap');
            res.write_wraps = [...wraps].map(w => ({
                class: w.className?.substring?.(0, 100),
                parent_class: w.parentElement?.className?.substring?.(0, 100),
                visible: w.offsetParent !== null,
                html: w.outerHTML?.substring(0, 1500),
            }));

            return res;
        }""")

        print(json.dumps(result, ensure_ascii=False, indent=2))

        # 스크린샷
        await page.screenshot(
            path="/home/window11/insung_blog/tools/reply_after_click.png",
            full_page=False
        )
        print("\n스크린샷: tools/reply_after_click.png")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

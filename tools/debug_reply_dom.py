#!/usr/bin/env python3
"""
네이버 블로그 대댓글 DOM 구조 분석 스크립트.
댓글이 있는 게시물의 댓글 영역 HTML을 덤프하여 대댓글 셀렉터를 파악.
"""
import asyncio
import json
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)

from dotenv import load_dotenv
load_dotenv()

from playwright.async_api import async_playwright


# 분석할 게시물 URL (댓글 많은 블로그)
TEST_URLS = [
    # 데스크톱 — iframe 구조 분석
    "https://blog.naver.com/zkk101earth/224237259952",
    # 모바일 — 직접 DOM 분석
    "https://m.blog.naver.com/zkk101earth/224237259952",
]

MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


async def analyze_desktop(page, url: str) -> None:
    """데스크톱 댓글 영역 DOM 분석."""
    print(f"\n{'='*60}")
    print(f"[데스크톱] {url}")
    print('='*60)

    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(3000)

    # mainFrame iframe 찾기
    frames = page.frames
    print(f"\n총 프레임 수: {len(frames)}")
    for f in frames:
        if "postView" in f.url or "PostView" in f.url:
            print(f"  PostView 프레임: {f.url[:80]}")

    # mainFrame에서 댓글 영역 분석
    main_frame = None
    for f in frames:
        if "mainFrame" in f.name or "postView" in f.url.lower():
            main_frame = f
            break

    if not main_frame:
        print("mainFrame 못 찾음, 페이지 본문에서 직접 탐색")
        main_frame = page

    # 댓글 버튼 찾기 시도
    comment_btn = await main_frame.query_selector(".btn_comment")
    if comment_btn:
        print("\n댓글 버튼 (.btn_comment) 발견 — 클릭")
        await comment_btn.click()
        await page.wait_for_timeout(3000)

    # 댓글 영역 HTML 덤프
    comment_html = await main_frame.evaluate("""() => {
        // 댓글 영역 컨테이너 찾기
        const areas = [
            document.querySelector('.u_cbox_area'),
            document.querySelector('[class*="comment"]'),
            document.querySelector('.cbox'),
        ];
        for (const area of areas) {
            if (area) return area.outerHTML.substring(0, 8000);
        }
        return 'NO COMMENT AREA FOUND';
    }""")
    print(f"\n[댓글 영역 HTML (앞 8000자)]")
    print(comment_html[:3000])

    # 대댓글 관련 셀렉터 탐색
    reply_info = await main_frame.evaluate("""() => {
        const result = {};

        // 1. 댓글 박스들
        const boxes = document.querySelectorAll('.u_cbox_comment_box');
        result.comment_box_count = boxes.length;

        // 2. 답글 버튼 탐색
        const replyBtns = [
            ...document.querySelectorAll('[class*="reply"]'),
            ...document.querySelectorAll('[class*="Reply"]'),
            ...document.querySelectorAll('[class*="답"]'),
            ...document.querySelectorAll('button[data-action*="reply"]'),
            ...document.querySelectorAll('a[class*="reply"]'),
        ];
        result.reply_buttons = replyBtns.map(b => ({
            tag: b.tagName,
            class: b.className,
            text: b.textContent?.trim()?.substring(0, 50),
            html: b.outerHTML?.substring(0, 200),
        }));

        // 3. 대댓글 컨테이너 탐색
        const replyContainers = [
            ...document.querySelectorAll('[class*="child"]'),
            ...document.querySelectorAll('[class*="nested"]'),
            ...document.querySelectorAll('[class*="sub_comment"]'),
            ...document.querySelectorAll('[class*="re_comment"]'),
            ...document.querySelectorAll('.u_cbox_reply_area'),
        ];
        result.reply_containers = replyContainers.map(c => ({
            tag: c.tagName,
            class: c.className,
            childCount: c.children?.length,
            html: c.outerHTML?.substring(0, 300),
        }));

        // 4. 각 댓글 박스 구조 분석
        if (boxes.length > 0) {
            const firstBox = boxes[0];
            result.first_box = {
                html: firstBox.outerHTML?.substring(0, 2000),
                classes: firstBox.className,
                children: [...firstBox.children].map(c => ({
                    tag: c.tagName,
                    class: c.className,
                })),
            };
        }

        // 5. 모든 class에서 reply 관련 키워드 검색
        const allElements = document.querySelectorAll('*');
        const replyClasses = new Set();
        for (const el of allElements) {
            const cls = el.className;
            if (typeof cls === 'string' && (
                cls.includes('reply') || cls.includes('Reply') ||
                cls.includes('child') || cls.includes('re_') ||
                cls.includes('답글') || cls.includes('대댓')
            )) {
                replyClasses.add(cls.substring(0, 100));
            }
        }
        result.reply_related_classes = [...replyClasses];

        return result;
    }""")

    print(f"\n[대댓글 관련 분석]")
    print(json.dumps(reply_info, ensure_ascii=False, indent=2))


async def analyze_mobile(page, url: str) -> None:
    """모바일 댓글 영역 DOM 분석."""
    print(f"\n{'='*60}")
    print(f"[모바일] {url}")
    print('='*60)

    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(3000)

    # 댓글 버튼 클릭 (lazy-load)
    comment_btn = await page.query_selector('[class*="comment_btn"]')
    if not comment_btn:
        comment_btn = await page.query_selector('a._commentCount')
    if comment_btn:
        print("댓글 버튼 발견 — 클릭")
        await comment_btn.click()
        await page.wait_for_timeout(5000)
    else:
        print("댓글 버튼 못 찾음")

    # 댓글 영역 전체 분석
    reply_info = await page.evaluate("""() => {
        const result = {};

        // 1. 댓글 박스들
        const boxes = document.querySelectorAll('.u_cbox_comment_box');
        result.comment_box_count = boxes.length;

        // 2. 답글 버튼 탐색 (광범위)
        const selectors = [
            '[class*="reply"]', '[class*="Reply"]',
            '[class*="답글"]', '[class*="re_"]',
            'button[class*="reply"]', 'a[class*="reply"]',
            '.u_cbox_tool_reply', '.u_cbox_btn_reply',
            '[data-action*="reply"]',
        ];
        const replyBtns = [];
        for (const sel of selectors) {
            for (const el of document.querySelectorAll(sel)) {
                replyBtns.push({
                    selector: sel,
                    tag: el.tagName,
                    class: el.className?.substring?.(0, 100) || '',
                    text: el.textContent?.trim()?.substring(0, 50),
                    html: el.outerHTML?.substring(0, 300),
                });
            }
        }
        result.reply_buttons = replyBtns;

        // 3. 모든 reply 관련 클래스 수집
        const allElements = document.querySelectorAll('*');
        const replyClasses = new Set();
        for (const el of allElements) {
            const cls = el.className;
            if (typeof cls === 'string' && (
                cls.includes('reply') || cls.includes('Reply') ||
                cls.includes('child') || cls.includes('re_') ||
                cls.includes('답글')
            )) {
                replyClasses.add(`${el.tagName}.${cls.substring(0, 80)}`);
            }
        }
        result.reply_related_classes = [...replyClasses];

        // 4. 첫 번째 댓글 박스 상세
        if (boxes.length > 0) {
            result.first_box_html = boxes[0].outerHTML?.substring(0, 3000);

            // 해당 댓글의 하위 요소 구조
            const walk = (el, depth = 0) => {
                if (depth > 4) return [];
                return [...el.children].map(c => ({
                    tag: c.tagName,
                    class: (c.className?.substring?.(0, 60) || ''),
                    childCount: c.children?.length || 0,
                    text: (c.children?.length === 0) ? c.textContent?.trim()?.substring(0, 30) : undefined,
                    children: walk(c, depth + 1),
                }));
            };
            result.first_box_tree = walk(boxes[0]);
        }

        // 5. 댓글 입력 영역 분석
        const inputs = document.querySelectorAll(
            '.u_cbox_text, [contenteditable="true"], textarea[class*="cbox"]'
        );
        result.input_areas = [...inputs].map(i => ({
            tag: i.tagName,
            class: i.className?.substring?.(0, 80),
            parent_class: i.parentElement?.className?.substring?.(0, 80),
        }));

        return result;
    }""")

    print(f"\n[모바일 댓글 분석 결과]")
    print(json.dumps(reply_info, ensure_ascii=False, indent=2))

    # 스크린샷
    await page.screenshot(path="/home/window11/insung_blog/tools/reply_dom_mobile.png", full_page=False)
    print("\n스크린샷 저장: tools/reply_dom_mobile.png")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # 데스크톱 분석
        ctx_desktop = await browser.new_context(viewport={"width": 1280, "height": 900})
        page_d = await ctx_desktop.new_page()
        try:
            await analyze_desktop(page_d, TEST_URLS[0])
        except Exception as e:
            print(f"데스크톱 분석 실패: {e}")
        await ctx_desktop.close()

        # 모바일 분석
        ctx_mobile = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent=MOBILE_UA,
        )
        page_m = await ctx_mobile.new_page()
        try:
            await analyze_mobile(page_m, TEST_URLS[1])
        except Exception as e:
            print(f"모바일 분석 실패: {e}")
        await ctx_mobile.close()

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

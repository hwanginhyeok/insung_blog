"""블로그 게시물 목록 구조 디버깅"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from src.utils.browser import create_browser


async def debug():
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser, context, page = await create_browser(pw, headless=True)
        try:
            # 1. PostTitleListAsync AJAX 엔드포인트 시도
            ajax_url = (
                "https://blog.naver.com/PostTitleListAsync.naver"
                "?blogId=youyoubear0517&viewdate=&currentPage=1"
                "&categoryNo=0&parentCategoryNo=0&countPerPage=30"
            )
            print(f"[1] AJAX 엔드포인트 시도: {ajax_url}")
            resp = await page.goto(ajax_url, timeout=30000)
            await asyncio.sleep(2)
            content = await page.content()
            print(f"    응답 길이: {len(content)}")
            print(f"    처음 3000자:\n{content[:3000]}")
            print("=" * 80)

            # 2. 메인 블로그 페이지에서 카테고리 확인
            await page.goto("https://blog.naver.com/youyoubear0517", timeout=30000)
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(3)

            # 메인 페이지 전체 프레임 목록
            frames = page.frames
            print(f"\n[2] 프레임 목록 ({len(frames)}개):")
            for f in frames:
                print(f"    name={f.name!r} url={f.url[:120]}")

            # mainFrame에서 카테고리 + 게시물 수 확인
            frame = page.frame("mainFrame") or page
            cat_info = await frame.evaluate("""() => {
                const results = [];
                const links = document.querySelectorAll('a');
                for (const a of links) {
                    const href = a.href || '';
                    const text = a.innerText.trim();
                    if (href.includes('categoryNo') && text) {
                        results.push(text + ' => ' + href);
                    }
                }
                return results.slice(0, 30);
            }""")
            print(f"\n[3] 카테고리 링크 ({len(cat_info)}개):")
            for c in cat_info:
                print(f"    {c}")

            # 전체글보기 수 찾기
            total_info = await frame.evaluate("""() => {
                const el = document.querySelector('.category_title, .blog2_totalcount, .total_count, #category');
                if (el) return el.innerText.trim();
                // 대안: 모든 텍스트에서 숫자(건) 패턴 찾기
                const all = document.body.innerText;
                const match = all.match(/전체[^0-9]*([0-9,]+)/);
                if (match) return 'found: ' + match[0];
                return 'total not found';
            }""")
            print(f"\n[4] 전체 게시물 수: {total_info}")

            # 3. currentPage=2로 직접 iframe URL 접속
            iframe_url = (
                "https://blog.naver.com/PostList.naver"
                "?blogId=youyoubear0517&categoryNo=0&currentPage=2"
            )
            print(f"\n[5] iframe URL 직접 접속: {iframe_url}")
            await page.goto(iframe_url, timeout=30000)
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(2)

            # 이 페이지에 게시물 링크 있는지
            frame2 = page.frame("mainFrame") or page
            links_p2 = await frame2.evaluate("""() => {
                const results = [];
                const links = document.querySelectorAll('a');
                for (const a of links) {
                    const href = a.href || '';
                    if (href.includes('logNo=') || href.match(/\\/\\d{12,}/)) {
                        results.push(href);
                    }
                }
                return [...new Set(results)].slice(0, 20);
            }""")
            print(f"    게시물 링크 ({len(links_p2)}개):")
            for l in links_p2:
                print(f"    {l}")

            # 4. 다른 뷰 모드 시도 (목록형)
            list_url = (
                "https://blog.naver.com/PostList.naver"
                "?blogId=youyoubear0517&categoryNo=0"
                "&from=postList&parentCategoryNo=0&currentPage=1&countPerPage=30"
            )
            print(f"\n[6] 목록형 30개/페이지: {list_url}")
            await page.goto(list_url, timeout=30000)
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(2)
            frame3 = page.frame("mainFrame") or page
            links_p3 = await frame3.evaluate("""() => {
                const results = [];
                const links = document.querySelectorAll('a');
                for (const a of links) {
                    const href = a.href || '';
                    if (href.includes('logNo=') || href.match(/\\/\\d{12,}/)) {
                        results.push(href);
                    }
                }
                return [...new Set(results)].slice(0, 40);
            }""")
            print(f"    게시물 링크 ({len(links_p3)}개):")
            for l in links_p3:
                print(f"    {l}")

        finally:
            await browser.close()


asyncio.run(debug())

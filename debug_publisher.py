"""
스마트에디터 DOM 구조 분석 도우미

headless=False로 글쓰기 페이지를 열고 에디터의 프레임 구조,
셀렉터, 이미지 업로드 요소 등을 탐색한다.
분석 결과는 콘솔 출력 + 스크린샷 + HTML 덤프로 저장.

사용법:
  python debug_publisher.py              # 기본 분석
  python debug_publisher.py --screenshot  # 스크린샷만 저장
"""
import argparse
import asyncio
import os

from playwright.async_api import Page, async_playwright

from config.settings import (
    BLOG_WRITE_URL,
    DATA_DIR,
    EDITOR_LOAD_TIMEOUT,
    PAGE_LOAD_TIMEOUT,
)
from src.auth.naver_login import ensure_login
from src.utils.browser import create_browser
from src.utils.logger import logger

DEBUG_DIR = DATA_DIR / "debug"


async def _dump_frames(page: Page, indent: int = 0) -> None:
    """페이지의 모든 프레임 트리를 출력"""
    prefix = "  " * indent
    for frame in page.frames:
        name = frame.name or "(이름 없음)"
        url = frame.url[:120] if frame.url else "(빈 URL)"
        print(f"{prefix}├─ Frame: {name}")
        print(f"{prefix}│  URL: {url}")


async def _probe_selectors(page: Page) -> dict:
    """글쓰기 페이지에서 주요 셀렉터 존재 여부를 탐색"""
    targets = {
        "제목": [
            "iframe[name='mainFrame']",
            ".se-title-text",
            "#title",
            "input[name='title']",
            ".se-ff-nanumgothic",
            "[placeholder*='제목']",
            ".post_title",
        ],
        "본문": [
            ".se-component-content",
            ".se-text-paragraph",
            "[contenteditable='true']",
            "#content",
            ".se-main-container",
            "#editor",
        ],
        "이미지": [
            "input[type='file']",
            "input[accept*='image']",
            ".se-image-tool-button",
            ".se-toolbar-item-image",
            "button[data-name='image']",
            ".se-oglink-tool-button",
        ],
        "태그": [
            ".post_tag",
            "input[name='tag']",
            "#tag",
            ".tag_input",
            "[placeholder*='태그']",
            "[placeholder*='해시태그']",
        ],
        "발행": [
            ".publish_btn",
            "#publish_btn",
            "button[data-name='publish']",
            ".se-publish-btn",
            "button:has-text('발행')",
            "button:has-text('공개발행')",
        ],
    }

    results: dict[str, list[str]] = {}
    # 메인 페이지와 모든 프레임에서 탐색
    search_targets = [page] + page.frames

    for category, selectors in targets.items():
        found: list[str] = []
        for target in search_targets:
            target_name = getattr(target, "name", "page") or "page"
            for sel in selectors:
                try:
                    el = await target.query_selector(sel)
                    if el:
                        tag = await el.evaluate("e => e.tagName")
                        found.append(f"[{target_name}] {sel} → <{tag}>")
                except Exception:
                    pass
        results[category] = found

    return results


async def _save_screenshot(page: Page) -> str:
    """스크린샷 저장, 경로 반환"""
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    path = str(DEBUG_DIR / "editor_screenshot.png")
    await page.screenshot(path=path, full_page=True)
    return path


async def _save_html_dump(page: Page) -> str:
    """페이지 HTML 덤프 저장, 경로 반환"""
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    path = str(DEBUG_DIR / "editor_dump.html")
    content = await page.content()
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

    # 각 프레임의 HTML도 별도 저장
    for i, frame in enumerate(page.frames):
        if frame == page.main_frame:
            continue
        frame_path = str(DEBUG_DIR / f"editor_frame_{i}_{frame.name or 'unnamed'}.html")
        try:
            frame_content = await frame.content()
            with open(frame_path, "w", encoding="utf-8") as f:
                f.write(frame_content)
        except Exception:
            pass

    return path


async def _validate_publisher_selectors(page: Page) -> dict:
    """blog_publisher.py의 실제 셀렉터가 현재 에디터에서 동작하는지 검증"""
    from src.publisher.blog_publisher import (
        _TITLE_SELECTORS,
        _BODY_SELECTORS,
        _IMAGE_BUTTON_SELECTORS,
        _TAG_SELECTORS,
        _FONT_BUTTON_SELECTORS,
        _FONTSIZE_BUTTON_SELECTORS,
    )

    groups = {
        "제목 (_TITLE_SELECTORS)": _TITLE_SELECTORS,
        "본문 (_BODY_SELECTORS)": _BODY_SELECTORS,
        "이미지 (_IMAGE_BUTTON_SELECTORS)": _IMAGE_BUTTON_SELECTORS,
        "태그 (_TAG_SELECTORS)": _TAG_SELECTORS,
        "폰트 (_FONT_BUTTON_SELECTORS)": _FONT_BUTTON_SELECTORS,
        "폰트크기 (_FONTSIZE_BUTTON_SELECTORS)": _FONTSIZE_BUTTON_SELECTORS,
    }

    results: dict[str, list[dict]] = {}
    search_targets = [("page", page)] + [
        (f.name or f"frame_{i}", f) for i, f in enumerate(page.frames) if f != page.main_frame
    ]

    for group_name, selectors in groups.items():
        matches: list[dict] = []
        for sel in selectors:
            for target_name, target in search_targets:
                try:
                    el = await target.query_selector(sel)
                    if el:
                        tag = await el.evaluate("e => e.tagName")
                        classes = await el.evaluate("e => e.className")
                        editable = await el.evaluate(
                            "e => e.isContentEditable || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA'"
                        )
                        matches.append({
                            "selector": sel,
                            "target": target_name,
                            "tag": tag,
                            "class": str(classes)[:80],
                            "editable": editable,
                        })
                except Exception:
                    pass
        results[group_name] = matches

    return results


async def run_debug(
    screenshot_only: bool = False,
    no_wait: bool = False,
    validate: bool = False,
) -> None:
    """글쓰기 페이지를 열고 DOM 구조를 분석"""
    naver_id = os.getenv("NAVER_ID", "")
    naver_pw = os.getenv("NAVER_PW", "")
    blog_id = os.getenv("MY_BLOG_ID", "")

    if not all([naver_id, naver_pw, blog_id]):
        logger.error(".env에 NAVER_ID, NAVER_PW, MY_BLOG_ID가 필요합니다")
        return

    async with async_playwright() as pw:
        browser, context, page = await create_browser(pw, headless=False)

        # 로그인
        logged_in = await ensure_login(context, page, naver_id, naver_pw)
        if not logged_in:
            logger.error("로그인 실패 — 중단")
            await browser.close()
            return

        # 글쓰기 페이지 이동
        write_url = BLOG_WRITE_URL.format(blog_id=blog_id)
        logger.info(f"글쓰기 페이지 이동: {write_url}")
        await page.goto(write_url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=EDITOR_LOAD_TIMEOUT)
        await asyncio.sleep(3)  # 에디터 로딩 대기

        # 스크린샷 저장
        screenshot_path = await _save_screenshot(page)
        logger.info(f"스크린샷 저장: {screenshot_path}")

        if screenshot_only:
            print(f"\n스크린샷 저장 완료: {screenshot_path}")
            await browser.close()
            return

        # 프레임 구조 출력
        print("\n" + "=" * 60)
        print("프레임 트리")
        print("=" * 60)
        await _dump_frames(page)

        # 셀렉터 탐색
        print("\n" + "=" * 60)
        print("셀렉터 탐색 결과")
        print("=" * 60)
        results = await _probe_selectors(page)
        for category, found in results.items():
            print(f"\n[{category}]")
            if found:
                for item in found:
                    print(f"  ✓ {item}")
            else:
                print("  ✗ 발견된 셀렉터 없음")

        # HTML 덤프 저장
        html_path = await _save_html_dump(page)
        logger.info(f"HTML 덤프 저장: {html_path}")

        # blog_publisher.py 셀렉터 검증
        if validate:
            print("\n" + "=" * 60)
            print("blog_publisher.py 셀렉터 검증")
            print("=" * 60)
            validation = await _validate_publisher_selectors(page)
            all_ok = True
            for group_name, matches in validation.items():
                if matches:
                    print(f"\n✅ {group_name}")
                    for m in matches:
                        edit_mark = " [editable]" if m["editable"] else ""
                        print(f"   ✓ {m['selector']} → <{m['tag']}>{edit_mark}")
                        print(f"     위치: {m['target']}, class: {m['class'][:50]}")
                else:
                    print(f"\n❌ {group_name} — 매칭 없음!")
                    all_ok = False

            if all_ok:
                print("\n🎉 모든 셀렉터 그룹에서 최소 1개 매칭 확인!")
            else:
                print("\n⚠️  일부 셀렉터 그룹에서 매칭 실패 — 업데이트 필요")

        print(f"\n스크린샷: {screenshot_path}")
        print(f"HTML 덤프: {html_path}")

        if no_wait:
            await browser.close()
        else:
            # 브라우저 열린 상태로 유지 (수동 확인용)
            print("\n브라우저를 닫으려면 Enter를 누르세요...")
            await asyncio.get_event_loop().run_in_executor(None, input)
            await browser.close()


def main() -> None:
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="스마트에디터 DOM 구조 분석")
    parser.add_argument("--screenshot", action="store_true", help="스크린샷만 저장")
    parser.add_argument("--no-wait", action="store_true", help="분석 후 자동 종료 (Enter 대기 없음)")
    parser.add_argument("--validate", action="store_true", help="blog_publisher.py 셀렉터 검증")
    args = parser.parse_args()

    asyncio.run(run_debug(
        screenshot_only=args.screenshot,
        no_wait=args.no_wait,
        validate=args.validate,
    ))


if __name__ == "__main__":
    main()

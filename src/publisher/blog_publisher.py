"""
스마트에디터 자동 발행 모듈 — Playwright로 네이버 블로그 글쓰기 자동화

흐름 (2026년 신형 스마트에디터 ONE 기준):
  1. 글쓰기 페이지 이동 (SPA, iframe 없음)
  2. 도움말 패널 닫기 (첫 방문 시 자동 표시됨)
  3. 제목 입력
  4. 이미지 업로드 (이미지 버튼 → file chooser)
  5. 본문 입력 (contenteditable div에 keyboard.type)
  6. 폰트 적용
  7. 발행 버튼 클릭 → 발행 모달 열림
  8. 모달에서 태그 입력
  9. 모달에서 확인 발행 → 게시물 URL 캡처
"""
import asyncio
import json
from pathlib import Path

from playwright.async_api import ElementHandle, Frame, Page

from config.settings import (
    BLOG_WRITE_URL,
    EDITOR_LOAD_TIMEOUT,
    FONT_CONFIG_PATH,
    IMAGE_UPLOAD_TIMEOUT,
    PAGE_LOAD_TIMEOUT,
    PUBLISH_CONFIRM_TIMEOUT,
)
from src.utils.delay import delay_short
from src.utils.logger import logger
from src.utils.photo_marker import strip_markers

# ── 제목 셀렉터 (우선순위순) ──
_TITLE_SELECTORS = [
    ".se-title-text .se-text-paragraph",     # 신형 스마트에디터 ONE (P 태그)
    ".se-title-text",                         # 신형 타이틀 영역 (DIV)
    "[placeholder*='제목']",                  # 플레이스홀더 기반
]

# ── 본문 셀렉터 (우선순위순) ──
_BODY_SELECTORS = [
    ".se-text-paragraph",                     # 신형 본문 텍스트 영역
    "[contenteditable='true']",               # contenteditable 범용
    ".se-component-content",                  # 신형 컴포넌트
]

# ── 이미지 업로드 셀렉터 ──
_IMAGE_BUTTON_SELECTORS = [
    "button[data-name='image']",              # 이미지 도구 버튼 (확인됨)
    ".se-toolbar-item-image button",          # 이미지 툴바 내 버튼
    ".se-image-tool-button",                  # 이미지 버튼
]

# ── 태그 셀렉터 (발행 모달 안) ──
_TAG_SELECTORS = [
    "[placeholder*='태그']",                  # placeholder="태그 입력 (최대 30개)"
    "[class*='tag_textarea']",                # tag_textarea__CD7pC
    "[class*='tag_input']",                   # tag_input__rvUB5
]

# ── 폰트 드롭다운 버튼 셀렉터 ──
_FONT_BUTTON_SELECTORS = [
    "button.se-toolbar-button-font",
    "button[data-name='font']",
    ".se-toolbar-item-font button",
]

_FONTSIZE_BUTTON_SELECTORS = [
    "button.se-toolbar-button-fontsize",
    "button[data-name='fontsize']",
    ".se-toolbar-item-fontsize button",
]


async def publish_post(
    page: Page,
    blog_id: str,
    title: str,
    body: str,
    image_paths: list[str],
    hashtags: list[str],
    dry_run: bool = False,
) -> str | None:
    """
    스마트에디터로 게시물 발행.

    Returns:
        게시물 URL (성공 시) 또는 None (실패 시)
    """
    # 본문에서 사진 마커 제거 (에디터에 텍스트로 노출 방지)
    body = strip_markers(body)

    # 글쓰기 페이지 이동
    write_url = BLOG_WRITE_URL.format(blog_id=blog_id)
    logger.info(f"글쓰기 페이지 이동: {write_url}")
    await page.goto(write_url, timeout=PAGE_LOAD_TIMEOUT)
    await page.wait_for_load_state("networkidle", timeout=EDITOR_LOAD_TIMEOUT)
    await asyncio.sleep(3)

    # 도움말 패널 닫기 (발행 버튼 가림 방지)
    await _close_help_panel(page)

    # 제목 입력
    title_ok = await _input_title(page, title)
    if not title_ok:
        logger.error("제목 입력 실패")
        return None
    await delay_short()

    # 이미지 업로드
    if image_paths:
        img_ok = await _upload_images(page, image_paths)
        if not img_ok:
            logger.warning("이미지 업로드 실패 — 본문만 게시합니다")
        await delay_short()

    # 본문 입력
    body_ok = await _input_body(page, body)
    if not body_ok:
        logger.error("본문 입력 실패")
        return None
    await delay_short()

    # 폰트 적용 (본문 입력 후)
    font_config = _load_font_config()
    if font_config and font_config.get("apply_font"):
        font_ok = await _apply_font_style(page, font_config)
        if font_ok:
            logger.info("폰트 적용 완료")
        else:
            logger.warning("폰트 적용 실패 — 기본 폰트로 게시합니다")
        await delay_short()

    # 발행 (모달 열기 → 태그 입력 → 확인)
    if dry_run:
        logger.info("[dry-run] 발행 모달 열어 태그 입력까지만 확인")
        modal_ok = await _open_publish_modal(page)
        if modal_ok and hashtags:
            await _input_hashtags_in_modal(page, hashtags)
        # 모달 닫기 (Escape)
        await page.keyboard.press("Escape")
        return "dry-run"

    post_url = await _publish_with_tags(page, hashtags)
    return post_url


# ── 도움말 패널 ──────────────────────────────────────────────────────────────


async def _close_help_panel(page: Page) -> None:
    """첫 방문 시 자동으로 뜨는 도움말 패널을 닫는다."""
    closed = await page.evaluate("""() => {
        // 방법 1: 닫기 버튼 클릭
        const closeBtn = document.querySelector(
            '[class*="close_btn"], [class*="closeBtn"], .se-help-panel-close'
        );
        if (closeBtn) { closeBtn.click(); return 'button'; }
        // 방법 2: 도움말 컨테이너 숨기기
        const containers = document.querySelectorAll('[class*="container__"]');
        for (const c of containers) {
            if (c.querySelector('.se-help-title, [class*="help"]')) {
                c.style.display = 'none';
                return 'hidden';
            }
        }
        return null;
    }""")
    if closed:
        logger.debug(f"도움말 패널 닫기: {closed}")
        await asyncio.sleep(0.5)


# ── 제목 입력 ────────────────────────────────────────────────────────────────


async def _input_title(page: Page, title: str) -> bool:
    """제목 입력 — 셀렉터 우선순위 리스트로 시도"""
    for selector in _TITLE_SELECTORS:
        try:
            el = await page.wait_for_selector(selector, timeout=5_000)
            if not el:
                continue

            is_editable = await el.evaluate(
                "e => e.isContentEditable || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA'"
            )
            if not is_editable:
                continue

            await el.click()
            await delay_short()

            tag = await el.evaluate("e => e.tagName.toLowerCase()")
            if tag in ("input", "textarea"):
                await el.fill(title)
            else:
                await el.press("Control+a")
                await page.keyboard.type(title, delay=20)

            logger.info(f"제목 입력 완료: {title[:30]}...")
            return True

        except Exception:
            continue

    return False


# ── 이미지 업로드 ────────────────────────────────────────────────────────────


async def _upload_images(page: Page, image_paths: list[str]) -> bool:
    """이미지 버튼 클릭 → file chooser로 업로드"""
    valid_paths = [p for p in image_paths if Path(p).exists()]
    if not valid_paths:
        logger.warning("유효한 이미지 파일이 없습니다")
        return False

    for selector in _IMAGE_BUTTON_SELECTORS:
        try:
            btn = await page.query_selector(selector)
            if not btn:
                continue

            async with page.expect_file_chooser(timeout=IMAGE_UPLOAD_TIMEOUT) as fc_info:
                await btn.click()

            file_chooser = await fc_info.value
            await file_chooser.set_files(valid_paths)
            # 이미지 업로드 + 에디터 반영 대기
            await asyncio.sleep(3 + len(valid_paths))
            logger.info(f"이미지 업로드 완료: {len(valid_paths)}장")
            return True

        except Exception as e:
            logger.debug(f"이미지 업로드 실패 ({selector}): {e}")
            continue

    logger.warning("이미지 업로드 방법을 찾지 못했습니다")
    return False


# ── 본문 입력 ────────────────────────────────────────────────────────────────


async def _input_body(page: Page, body: str) -> bool:
    """본문 입력 — contenteditable div에 keyboard.type()"""
    for selector in _BODY_SELECTORS:
        try:
            # 제목 영역 P 태그와 본문 영역 P 태그 구분
            elements = await page.query_selector_all(selector)
            for el in elements:
                is_editable = await el.evaluate(
                    "e => e.isContentEditable || e.tagName === 'TEXTAREA'"
                )
                if not is_editable:
                    continue
                # 제목 영역 내부의 P 태그는 건너뜀
                in_title = await el.evaluate(
                    "e => !!e.closest('.se-title-text')"
                )
                if in_title:
                    continue

                await el.click()
                await delay_short()

                # 줄바꿈을 Enter 키로 변환
                lines = body.split("\n")
                for i, line in enumerate(lines):
                    if line:
                        await page.keyboard.type(line, delay=20)
                    if i < len(lines) - 1:
                        await page.keyboard.press("Enter")
                        await asyncio.sleep(0.1)

                logger.info(f"본문 입력 완료 ({len(body)}자)")
                return True

        except Exception as e:
            logger.debug(f"본문 입력 실패 ({selector}): {e}")
            continue

    return False


# ── 발행 모달 + 태그 + 확인 ──────────────────────────────────────────────────


async def _open_publish_modal(page: Page) -> bool:
    """상단 발행 버튼을 JS 클릭하여 발행 모달을 연다."""
    opened = await page.evaluate("""() => {
        // data-click-area 기반
        const btn = document.querySelector('button[data-click-area="tpb.publish"]');
        if (btn) { btn.click(); return true; }
        // 텍스트 폴백
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
            const text = b.textContent.trim();
            if (text === '발행' && !b.closest('[class*="publish_btn_area"]')) {
                continue;
            }
            if (text === '발행') { b.click(); return true; }
        }
        return false;
    }""")
    if opened:
        await asyncio.sleep(2)
        logger.debug("발행 모달 열림")
    else:
        logger.error("발행 버튼을 찾지 못했습니다")
    return opened


async def _input_hashtags_in_modal(page: Page, hashtags: list[str]) -> bool:
    """발행 모달 내 태그 입력창에 해시태그를 입력한다."""
    for selector in _TAG_SELECTORS:
        try:
            tag_el = await page.query_selector(selector)
            if not tag_el:
                continue

            await tag_el.click()
            await asyncio.sleep(0.3)

            for tag in hashtags:
                # # 기호 제거 (placeholder에 #이 이미 있음)
                clean_tag = tag.lstrip("#").strip()
                if not clean_tag:
                    continue
                await page.keyboard.type(clean_tag, delay=30)
                await asyncio.sleep(0.2)
                await page.keyboard.press("Enter")
                await asyncio.sleep(0.3)

            logger.info(f"해시태그 입력 완료: {len(hashtags)}개")
            return True

        except Exception as e:
            logger.debug(f"태그 입력 실패 ({selector}): {e}")
            continue

    logger.warning("태그 입력창을 찾지 못했습니다")
    return False


async def _click_confirm_publish(page: Page) -> str | None:
    """모달 내 녹색 '✓ 발행' 확인 버튼을 클릭하고 게시물 URL을 캡처한다."""
    # 모달 내 확인 발행 버튼 (발행 모달 영역 안의 발행 버튼)
    confirmed = await page.evaluate("""() => {
        // 모달 영역 내의 발행 버튼 찾기
        const area = document.querySelector('[class*="publish_btn_area"]');
        if (!area) return false;
        // 모달 내부의 모든 버튼에서 "발행" 텍스트를 가진 것
        const btns = area.querySelectorAll('button');
        // 발행 모달이 열린 상태에서는 영역 밖에 확인 발행 버튼이 있을 수 있음
        // 페이지 전체에서 발행 모달의 확인 버튼 탐색
        const allBtns = document.querySelectorAll('button');
        for (const b of allBtns) {
            const text = b.textContent.trim();
            // 모달 하단의 확인 발행 버튼은 체크 아이콘 + "발행" 텍스트
            if (text === '발행' && b.closest('[class*="option"]')) {
                b.click();
                return true;
            }
        }
        return false;
    }""")

    if not confirmed:
        # 폴백: locator로 모달 내 발행 버튼 찾기
        try:
            # 발행 모달의 확인 버튼은 보통 마지막 발행 버튼
            btns = page.locator("button:has-text('발행')")
            count = await btns.count()
            if count >= 2:
                # 마지막 발행 버튼이 확인 버튼
                await btns.last.click()
                confirmed = True
            elif count == 1:
                await btns.first.click()
                confirmed = True
        except Exception as e:
            logger.debug(f"확인 발행 버튼 폴백 실패: {e}")

    if not confirmed:
        logger.error("확인 발행 버튼을 찾지 못했습니다")
        return None

    logger.info("확인 발행 클릭")
    await asyncio.sleep(3)

    # 게시물 URL 캡처
    try:
        await page.wait_for_url("**/blog.naver.com/**", timeout=PUBLISH_CONFIRM_TIMEOUT)
    except Exception:
        await asyncio.sleep(3)

    post_url = page.url
    if "postwrite" not in post_url.lower():
        logger.info(f"게시물 발행 완료: {post_url}")
        return post_url

    logger.warning(f"발행 후 URL이 글쓰기 페이지 — 확인 필요: {post_url}")
    return post_url


async def _publish_with_tags(page: Page, hashtags: list[str]) -> str | None:
    """발행 모달 열기 → 태그 입력 → 확인 발행의 전체 흐름."""
    # 모달 열기
    modal_ok = await _open_publish_modal(page)
    if not modal_ok:
        return None

    # 태그 입력
    if hashtags:
        await _input_hashtags_in_modal(page, hashtags)
        await delay_short()

    # 확인 발행
    return await _click_confirm_publish(page)


# ── 폰트 적용 ────────────────────────────────────────────────────────────────


def _load_font_config() -> dict | None:
    """_font_config.json 로드. 파일 없으면 None 반환."""
    if not FONT_CONFIG_PATH.exists():
        return None
    try:
        with open(FONT_CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.debug(f"폰트 설정 로드 실패: {e}")
        return None


async def _apply_font_style(page: Page, font_config: dict) -> bool:
    """본문 전체 선택 후 폰트/크기 변경."""
    # 본문 전체 선택
    try:
        for sel in _BODY_SELECTORS:
            elements = await page.query_selector_all(sel)
            for el in elements:
                is_editable = await el.evaluate(
                    "e => e.isContentEditable || e.tagName === 'TEXTAREA'"
                )
                in_title = await el.evaluate("e => !!e.closest('.se-title-text')")
                if is_editable and not in_title:
                    await el.click()
                    await page.keyboard.press("Control+a")
                    await asyncio.sleep(0.5)
                    break
            else:
                continue
            break
    except Exception as e:
        logger.debug(f"본문 전체 선택 실패: {e}")
        return False

    applied = False

    # 폰트 패밀리
    font_name = font_config.get("primary_font", {}).get("display_name", "")
    font_class = font_config.get("primary_font", {}).get("class_name", "")
    if font_name and font_config.get("apply_font"):
        ok = await _select_from_dropdown(page, _FONT_BUTTON_SELECTORS, font_name, font_class)
        if ok:
            logger.debug(f"폰트 적용: {font_name}")
            applied = True

    # 폰트 크기
    font_size = font_config.get("primary_size", "")
    if font_size and font_config.get("apply_size"):
        ok = await _select_from_dropdown(page, _FONTSIZE_BUTTON_SELECTORS, font_size, font_size)
        if ok:
            logger.debug(f"폰트 크기 적용: {font_size}")
            applied = True

    return applied


async def _select_from_dropdown(
    page: Page,
    button_selectors: list[str],
    display_name: str,
    class_hint: str,
) -> bool:
    """툴바 드롭다운 버튼 클릭 → 메뉴에서 항목 선택."""
    for selector in button_selectors:
        try:
            btn = await page.query_selector(selector)
            if not btn:
                continue

            await btn.click()
            await asyncio.sleep(0.8)

            # 텍스트로 항목 찾기
            item = None
            try:
                locator = page.locator(
                    f"li:has-text('{display_name}'), "
                    f"button:has-text('{display_name}')"
                )
                if await locator.count() > 0:
                    item = await locator.first.element_handle()
            except Exception:
                pass

            # 클래스명으로 찾기
            if not item and class_hint:
                try:
                    item = await page.query_selector(
                        f"[class*='{class_hint}'], [data-value='{class_hint}']"
                    )
                except Exception:
                    pass

            if item:
                await item.click()
                await asyncio.sleep(0.3)
                return True

            await page.keyboard.press("Escape")

        except Exception as e:
            logger.debug(f"드롭다운 선택 실패 ({selector}): {e}")
            continue

    return False

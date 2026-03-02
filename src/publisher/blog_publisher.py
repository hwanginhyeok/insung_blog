"""
스마트에디터 자동 발행 모듈 — Playwright로 네이버 블로그 글쓰기 자동화

흐름:
  1. 글쓰기 페이지 이동 → 에디터 프레임 탐색
  2. 제목 입력
  3. 이미지 업로드 (file input 우선 → file chooser 폴백)
  4. 본문 입력 (contenteditable div에 keyboard.type)
  5. 해시태그 입력
  6. 발행 버튼 클릭 → 확인 모달 → 게시물 URL 캡처
"""
import asyncio
from pathlib import Path

from playwright.async_api import ElementHandle, Frame, Page

from config.settings import (
    BLOG_WRITE_URL,
    EDITOR_LOAD_TIMEOUT,
    ELEMENT_TIMEOUT,
    IMAGE_UPLOAD_TIMEOUT,
    PAGE_LOAD_TIMEOUT,
    PUBLISH_CONFIRM_TIMEOUT,
)
from src.utils.delay import delay_short
from src.utils.logger import logger

# ── 에디터 프레임 셀렉터 ──
_EDITOR_FRAME_SELECTORS = [
    "mainFrame",
    "se2_iframe",
]

# ── 제목 셀렉터 (우선순위순) ──
_TITLE_SELECTORS = [
    ".se-title-text .se-text-paragraph",     # 신형 스마트에디터 ONE
    ".se-title-text",                         # 신형 타이틀 영역
    "#title",                                 # 구형 에디터
    "input[name='title']",                    # 일부 구형
    "[placeholder*='제목']",                  # 플레이스홀더 기반
    ".post_title input",                      # 일부 스킨
]

# ── 본문 셀렉터 (우선순위순) ──
_BODY_SELECTORS = [
    ".se-text-paragraph",                     # 신형 본문 텍스트 영역
    "[contenteditable='true']",               # contenteditable 범용
    ".se-component-content",                  # 신형 컴포넌트
    "#content",                               # 구형
    ".se-main-container",                     # 신형 메인 컨테이너
]

# ── 이미지 업로드 셀렉터 ──
_IMAGE_INPUT_SELECTORS = [
    "input[type='file'][accept*='image']",    # 파일 입력 (이미지 전용)
    "input[type='file']",                     # 범용 파일 입력
]

_IMAGE_BUTTON_SELECTORS = [
    "button[data-name='image']",              # 이미지 도구 버튼
    ".se-toolbar-item-image",                 # 이미지 툴바
    ".se-image-tool-button",                  # 이미지 버튼
    "button[data-type='image']",              # 데이터 타입 기반
]

# ── 태그 셀렉터 ──
_TAG_SELECTORS = [
    ".post_tag input",                        # 태그 입력
    "input[name='tag']",                      # 이름 기반
    "#tag",                                   # ID 기반
    ".tag_input input",                       # 클래스 기반
    "[placeholder*='태그']",                  # 플레이스홀더
    "[placeholder*='해시태그']",              # 해시태그 플레이스홀더
]

# ── 발행 버튼 셀렉터 ──
_PUBLISH_SELECTORS = [
    "button.publish_btn__Y5M08",              # 신형 클래스
    ".publish_btn",                           # 발행 버튼
    "#publish_btn",                           # ID 기반
    "button[data-name='publish']",            # 데이터 기반
    ".se-publish-btn",                        # 스마트에디터
]

# ── 발행 확인 모달 ──
_CONFIRM_SELECTORS = [
    "button.confirm_btn__WEaBq",              # 신형 확인
    ".confirm_btn",                           # 확인 버튼
    "button:has-text('확인')",                # 텍스트 기반
    "button:has-text('발행')",                # 발행 텍스트
    "button:has-text('공개발행')",            # 공개발행 텍스트
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

    Args:
        page: Playwright 페이지 (로그인 상태)
        blog_id: 네이버 블로그 ID
        title: 게시물 제목
        body: 게시물 본문
        image_paths: 이미지 파일 경로 리스트
        hashtags: 해시태그 리스트
        dry_run: True면 발행 버튼 클릭 생략

    Returns:
        게시물 URL (성공 시) 또는 None (실패 시)
    """
    # 글쓰기 페이지 이동
    write_url = BLOG_WRITE_URL.format(blog_id=blog_id)
    logger.info(f"글쓰기 페이지 이동: {write_url}")
    await page.goto(write_url, timeout=PAGE_LOAD_TIMEOUT)
    await page.wait_for_load_state("networkidle", timeout=EDITOR_LOAD_TIMEOUT)
    await asyncio.sleep(3)  # 에디터 완전 로딩 대기

    # 에디터 프레임 탐색
    editor = await _find_editor_frame(page)
    if editor is None:
        logger.error("에디터 프레임을 찾지 못했습니다")
        return None

    # 제목 입력
    title_ok = await _input_title(editor, title)
    if not title_ok:
        logger.error("제목 입력 실패")
        return None
    await delay_short()

    # 이미지 업로드
    if image_paths:
        img_ok = await _upload_images(page, editor, image_paths)
        if not img_ok:
            logger.warning("이미지 업로드 실패 — 본문만 게시합니다")
        await delay_short()

    # 본문 입력
    body_ok = await _input_body(editor, body)
    if not body_ok:
        logger.error("본문 입력 실패")
        return None
    await delay_short()

    # 해시태그 입력
    if hashtags:
        tag_ok = await _input_hashtags(page, editor, hashtags)
        if not tag_ok:
            logger.warning("해시태그 입력 실패 — 태그 없이 게시합니다")
        await delay_short()

    # 발행
    if dry_run:
        logger.info("[dry-run] 발행 버튼 클릭 생략")
        return "dry-run"

    post_url = await _click_publish(page, editor)
    return post_url


async def _find_editor_frame(page: Page) -> Frame | Page | None:
    """
    에디터가 위치한 프레임(또는 페이지 자체)을 반환.
    네이버 글쓰기 페이지는 iframe 구조가 아닐 수도 있다 (SPA).
    """
    # 이름으로 프레임 찾기
    for name in _EDITOR_FRAME_SELECTORS:
        frame = page.frame(name)
        if frame:
            logger.debug(f"에디터 프레임 발견: {name}")
            return frame

    # 프레임 URL로 찾기
    for frame in page.frames:
        url = (frame.url or "").lower()
        if "postwrite" in url or "editor" in url or "smarteditor" in url:
            logger.debug(f"에디터 프레임 발견 (URL): {frame.url[:80]}")
            return frame

    # 페이지 자체에 에디터가 있는 경우 (SPA)
    for sel in _TITLE_SELECTORS:
        try:
            el = await page.query_selector(sel)
            if el:
                logger.debug("에디터가 페이지 직접에 위치 (SPA)")
                return page
        except Exception:
            continue

    logger.warning("에디터 프레임을 찾지 못했습니다")
    return None


async def _input_title(editor: Frame | Page, title: str) -> bool:
    """제목 입력 — 셀렉터 우선순위 리스트로 시도"""
    for selector in _TITLE_SELECTORS:
        try:
            el = await editor.wait_for_selector(selector, timeout=5_000)
            if not el:
                continue

            # contenteditable인지 input인지 판별
            tag = await el.evaluate("e => e.tagName.toLowerCase()")
            is_editable = await el.evaluate(
                "e => e.isContentEditable || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA'"
            )

            if not is_editable:
                continue

            await el.click()
            await delay_short()

            if tag in ("input", "textarea"):
                await el.fill(title)
            else:
                # contenteditable — keyboard.type으로 입력
                await el.press("Control+a")
                await editor.keyboard.type(title, delay=20)

            logger.info(f"제목 입력 완료: {title[:30]}...")
            return True

        except Exception:
            continue

    return False


async def _upload_images(
    page: Page,
    editor: Frame | Page,
    image_paths: list[str],
) -> bool:
    """
    이미지 업로드 — 이중 전략:
    1. file input 요소에 직접 set_input_files
    2. 이미지 버튼 클릭 → file chooser 이벤트 캡처
    """
    valid_paths = [p for p in image_paths if Path(p).exists()]
    if not valid_paths:
        return False

    # 전략 1: file input 직접 사용
    for selector in _IMAGE_INPUT_SELECTORS:
        try:
            file_input = await editor.query_selector(selector)
            if file_input:
                await file_input.set_input_files(valid_paths)
                await asyncio.sleep(3)  # 업로드 처리 대기
                logger.info(f"이미지 업로드 완료 (file input): {len(valid_paths)}장")
                return True
        except Exception as e:
            logger.debug(f"file input 실패 ({selector}): {e}")
            continue

    # 페이지 레벨에서도 file input 탐색
    for selector in _IMAGE_INPUT_SELECTORS:
        try:
            file_input = await page.query_selector(selector)
            if file_input:
                await file_input.set_input_files(valid_paths)
                await asyncio.sleep(3)
                logger.info(f"이미지 업로드 완료 (page file input): {len(valid_paths)}장")
                return True
        except Exception:
            continue

    # 전략 2: 이미지 버튼 클릭 → file chooser
    for selector in _IMAGE_BUTTON_SELECTORS:
        try:
            btn = await editor.query_selector(selector)
            if not btn:
                btn = await page.query_selector(selector)
            if not btn:
                continue

            async with page.expect_file_chooser(timeout=IMAGE_UPLOAD_TIMEOUT) as fc_info:
                await btn.click()

            file_chooser = await fc_info.value
            await file_chooser.set_files(valid_paths)
            await asyncio.sleep(3)  # 업로드 처리 대기
            logger.info(f"이미지 업로드 완료 (file chooser): {len(valid_paths)}장")
            return True

        except Exception as e:
            logger.debug(f"file chooser 실패 ({selector}): {e}")
            continue

    logger.warning("이미지 업로드 방법을 찾지 못했습니다")
    return False


async def _input_body(editor: Frame | Page, body: str) -> bool:
    """
    본문 입력 — contenteditable div에 keyboard.type()
    줄바꿈은 Enter 키로 처리.
    """
    for selector in _BODY_SELECTORS:
        try:
            el = await editor.query_selector(selector)
            if not el:
                continue

            is_editable = await el.evaluate(
                "e => e.isContentEditable || e.tagName === 'TEXTAREA'"
            )
            if not is_editable:
                continue

            await el.click()
            await delay_short()

            # 줄바꿈을 Enter 키로 변환하여 입력
            lines = body.split("\n")
            for i, line in enumerate(lines):
                if line:
                    await editor.keyboard.type(line, delay=20)
                if i < len(lines) - 1:
                    await editor.keyboard.press("Enter")
                    await asyncio.sleep(0.1)

            logger.info(f"본문 입력 완료 ({len(body)}자)")
            return True

        except Exception as e:
            logger.debug(f"본문 입력 실패 ({selector}): {e}")
            continue

    return False


async def _input_hashtags(
    page: Page,
    editor: Frame | Page,
    hashtags: list[str],
) -> bool:
    """해시태그 입력 — 태그 입력창에 하나씩 입력 후 Enter"""
    # 에디터 프레임과 페이지 양쪽에서 탐색
    search_targets = [editor, page] if editor != page else [page]

    for target in search_targets:
        for selector in _TAG_SELECTORS:
            try:
                tag_input = await target.query_selector(selector)
                if not tag_input:
                    continue

                await tag_input.click()
                await delay_short()

                for tag in hashtags:
                    await tag_input.fill(tag)
                    await asyncio.sleep(0.2)
                    await tag_input.press("Enter")
                    await asyncio.sleep(0.3)

                logger.info(f"해시태그 입력 완료: {len(hashtags)}개")
                return True

            except Exception as e:
                logger.debug(f"태그 입력 실패 ({selector}): {e}")
                continue

    logger.warning("태그 입력창을 찾지 못했습니다")
    return False


async def _click_publish(page: Page, editor: Frame | Page) -> str | None:
    """
    발행 버튼 클릭 → 확인 모달 처리 → 게시물 URL 캡처.
    """
    # 발행 버튼 찾기 (에디터와 페이지 양쪽)
    search_targets = [editor, page] if editor != page else [page]
    publish_btn = None

    for target in search_targets:
        for selector in _PUBLISH_SELECTORS:
            try:
                publish_btn = await target.query_selector(selector)
                if publish_btn:
                    break
            except Exception:
                continue
        if publish_btn:
            break

    # 텍스트 기반 최후 수단
    if not publish_btn:
        for target in search_targets:
            try:
                publish_btn = await _find_by_text(target, ["발행", "공개발행", "올리기"])
                if publish_btn:
                    break
            except Exception:
                continue

    if not publish_btn:
        logger.error("발행 버튼을 찾지 못했습니다")
        return None

    await publish_btn.click()
    logger.info("발행 버튼 클릭")
    await asyncio.sleep(2)

    # 확인 모달 처리
    confirm_btn = None
    for target in search_targets:
        for selector in _CONFIRM_SELECTORS:
            try:
                confirm_btn = await target.query_selector(selector)
                if confirm_btn:
                    break
            except Exception:
                continue
        if confirm_btn:
            break

    if confirm_btn:
        await confirm_btn.click()
        logger.info("발행 확인 모달 클릭")
        await asyncio.sleep(3)

    # 게시물 URL 캡처 (페이지 이동 대기)
    try:
        await page.wait_for_url(
            f"**/blog.naver.com/{page.url.split('/')[-1] if '/' in page.url else ''}**",
            timeout=PUBLISH_CONFIRM_TIMEOUT,
        )
    except Exception:
        # URL 패턴 매칭 실패 시 단순 대기
        await asyncio.sleep(3)

    post_url = page.url
    if "postwrite" not in post_url.lower():
        logger.info(f"게시물 발행 완료: {post_url}")
        return post_url

    # URL이 여전히 글쓰기 페이지 → 실패 가능성
    logger.warning(f"발행 후 URL이 글쓰기 페이지 — 확인 필요: {post_url}")
    return post_url


async def _find_by_text(
    target: Frame | Page,
    texts: list[str],
) -> ElementHandle | None:
    """버튼을 텍스트로 탐색 (최후 수단)"""
    for text in texts:
        try:
            locator = target.locator(f"button:has-text('{text}')")
            count = await locator.count()
            if count > 0:
                return await locator.first.element_handle()
        except Exception:
            continue
    return None

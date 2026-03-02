"""
댓글 작성 모듈 — iframe 중첩 구조 처리 + 인간적 타이핑 시뮬레이션

네이버 블로그 댓글 iframe 구조:
  패턴 A: 페이지 → iframe#mainFrame → iframe#commentIframe
  패턴 B: 페이지 → iframe#commentIframe (직접)
  패턴 C: 페이지 직접 (모바일형 또는 일부 스킨)
"""
import asyncio

from playwright.async_api import Frame, Page

from config.settings import ELEMENT_TIMEOUT, MAX_POST_RETRIES, PAGE_LOAD_TIMEOUT
from src.commenter.ai_comment import generate_comment
from src.utils.delay import delay_short, delay_typing
from src.utils.logger import logger

# 네이버 블로그 본문 영역 셀렉터 (신형 → 구형 순서)
_BODY_SELECTORS = [
    ".se-main-container",       # 새 스마트에디터
    "#postViewArea",            # 구 에디터
    ".post-view",               # 일부 스킨
    "#content-area",            # 모바일형
]

# 댓글 입력창 셀렉터 (신형 → 구형 순서로 시도)
_TEXTAREA_SELECTORS = [
    ".u_cbox_write_wrap textarea",
    ".u_cbox_write textarea",
    ".comment_write_box textarea",
    "#cbox_module textarea",
    "textarea[placeholder*='댓글']",
    "textarea",
]

# 등록 버튼 셀렉터
_SUBMIT_SELECTORS = [
    ".u_cbox_btn_upload",
    ".btn_type2.off",
    ".u_cbox_write_wrap button[type='submit']",
    "button.u_cbox_btn_upload",
    ".btn_comment_write",
    "button[class*='upload']",
]

# 캡차 감지 키워드
_CAPTCHA_INDICATORS = [
    "captcha",
    "자동입력방지",
    "보안문자",
    "자동 입력",
]


async def write_comment(
    page: Page,
    post_url: str,
    post_title: str,
    dry_run: bool = False,
) -> tuple[bool, str]:
    """
    게시물 URL에 댓글 작성.
    Returns (success, comment_text)
    dry_run=True 이면 실제 제출 없이 시뮬레이션.
    """
    comment_text = ""

    for attempt in range(1, MAX_POST_RETRIES + 1):
        try:
            await page.goto(post_url, timeout=PAGE_LOAD_TIMEOUT)
            await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
            await delay_short()

            # 페이지 읽기 시간 시뮬레이션 (자연스러운 체류 흉내)
            await _simulate_reading(page)

            # 본문 추출 → AI 댓글 생성 (첫 시도에서만)
            if not comment_text:
                post_body = await _extract_post_body(page)
                comment_text = generate_comment(post_body, post_title)

            # 캡차 감지
            if await _is_captcha_present(page):
                logger.warning(f"캡차 감지 — 게시물 스킵: {post_url}")
                return False, comment_text

            # iframe 탐색
            comment_frame = await _find_comment_frame(page)
            if comment_frame is None:
                logger.warning(f"댓글 iframe 없음 — 게시물 스킵: {post_url}")
                return False, comment_text

            success = await _fill_and_submit(comment_frame, comment_text, dry_run)
            if success:
                logger.info(f"댓글 작성 {'(dry-run)' if dry_run else '완료'}: {post_url[:60]}")
                return True, comment_text

        except Exception as e:
            logger.warning(f"댓글 작성 오류 (시도 {attempt}/{MAX_POST_RETRIES}): {e}")
            if attempt < MAX_POST_RETRIES:
                await asyncio.sleep(3)

    return False, comment_text


async def _simulate_reading(page: Page) -> None:
    """페이지 체류 시간 시뮬레이션.
    글을 실제로 읽는 것처럼 2~5초 대기 후 자연스러운 스크롤 수행."""
    import random
    read_secs = random.uniform(2.0, 5.0)
    await asyncio.sleep(read_secs)
    try:
        # 두 단계 스크롤: 중간까지 내린 후 댓글창 방향으로 추가 스크롤
        scroll_mid = random.randint(300, 700)
        scroll_bottom = random.randint(400, 900)
        await page.evaluate(f"window.scrollBy(0, {scroll_mid})")
        await asyncio.sleep(random.uniform(0.5, 1.5))
        await page.evaluate(f"window.scrollBy(0, {scroll_bottom})")
        await asyncio.sleep(random.uniform(0.3, 0.8))
    except Exception:
        pass


async def _extract_post_body(page: Page) -> str:
    """게시물 본문 텍스트 추출.
    mainFrame이 있으면 그 안에서, 없으면 페이지에서 직접 추출."""
    target_frame = page.frame("mainFrame") or page.main_frame

    for selector in _BODY_SELECTORS:
        try:
            el = await target_frame.query_selector(selector)
            if el:
                text = await el.inner_text()
                text = text.strip()
                if len(text) >= 20:
                    logger.debug(f"본문 추출 성공 ({len(text)}자, 셀렉터: {selector})")
                    return text
        except Exception:
            continue

    # 최후 수단: 전체 body 텍스트 (노이즈 포함 가능)
    try:
        body = await target_frame.query_selector("body")
        if body:
            text = await body.inner_text()
            logger.debug(f"본문 폴백 추출 (body 전체, {len(text)}자)")
            return text.strip()
    except Exception:
        pass

    logger.debug("본문 추출 실패 — 빈 문자열 반환")
    return ""


async def _find_comment_frame(page: Page) -> Frame | None:
    """
    댓글 입력창이 있는 Frame 반환.
    패턴 A/B/C 순서로 시도. iframe lazy-load 대비 최대 3회 재시도.
    """
    for attempt in range(3):
        frame = await _try_find_comment_frame(page)
        if frame:
            return frame
        if attempt < 2:
            await asyncio.sleep(2)
    return None


async def _try_find_comment_frame(page: Page) -> Frame | None:
    """단일 탐색 시도 — 이름·URL 양쪽으로 comment/cbox 포함 여부 확인"""
    def _is_comment_frame(f: Frame) -> bool:
        name = (f.name or "").lower()
        url = (f.url or "").lower()
        return "comment" in name or "comment" in url or "cbox" in url

    # 패턴 A: mainFrame → 자식 iframe
    main_frame = page.frame("mainFrame")
    if main_frame:
        for cf in main_frame.child_frames:
            if _is_comment_frame(cf) or await _has_textarea(cf):
                return cf
        # mainFrame 자체에 댓글창이 있는 경우
        if await _has_textarea(main_frame):
            return main_frame

    # 패턴 B: 페이지 직접 하위 comment/cbox iframe
    for frame in page.frames:
        if _is_comment_frame(frame) and await _has_textarea(frame):
            return frame

    # 패턴 C: 페이지 직접
    if await _has_textarea(page.main_frame):
        return page.main_frame

    # 최후 수단: 모든 iframe 순회
    for frame in page.frames:
        if await _has_textarea(frame):
            return frame

    return None


async def _has_textarea(frame: Frame) -> bool:
    """해당 Frame에 댓글 textarea가 존재하는지 확인"""
    for selector in _TEXTAREA_SELECTORS:
        try:
            el = await frame.query_selector(selector)
            if el:
                return True
        except Exception:
            continue
    return False


async def _fill_and_submit(frame: Frame, text: str, dry_run: bool) -> bool:
    """
    댓글 입력창에 텍스트 입력 후 제출.
    글자 단위 타이핑으로 인간적 패턴 시뮬레이션.
    """
    textarea = None
    for selector in _TEXTAREA_SELECTORS:
        try:
            textarea = await frame.wait_for_selector(selector, timeout=ELEMENT_TIMEOUT)
            if textarea:
                break
        except Exception:
            continue

    if not textarea:
        logger.debug("textarea를 찾지 못했습니다")
        return False

    # 클릭 후 포커스
    await textarea.click()
    await delay_short()

    # 글자 단위 타이핑 (봇 감지 회피)
    for char in text:
        await textarea.type(char, delay=0)
        await delay_typing()

    await delay_short()

    if dry_run:
        logger.info(f"[dry-run] 입력 완료 (제출 생략): {text[:40]}...")
        # 입력 내용 지우기
        await textarea.fill("")
        return True

    # 등록 버튼 클릭
    submit_btn = None
    for selector in _SUBMIT_SELECTORS:
        try:
            submit_btn = await frame.query_selector(selector)
            if submit_btn:
                break
        except Exception:
            continue

    if not submit_btn:
        logger.debug("제출 버튼을 찾지 못했습니다")
        return False

    await submit_btn.click()
    await asyncio.sleep(2)  # 제출 후 반응 대기

    # 제출 후 캡차 재확인
    try:
        page = frame.page
        if await _is_captcha_present(page):
            logger.warning("댓글 제출 후 캡차 발생")
            return False
    except Exception:
        pass

    return True


async def _is_captcha_present(page: Page) -> bool:
    """페이지 내 캡차 요소 또는 텍스트 감지"""
    try:
        content = await page.content()
        content_lower = content.lower()
        for indicator in _CAPTCHA_INDICATORS:
            if indicator in content_lower:
                return True
    except Exception:
        pass
    return False

"""
댓글 작성 모듈 — mainFrame 내 댓글 영역 처리 + 인간적 타이핑 시뮬레이션

네이버 블로그 댓글 구조 (2026년 기준):
  1. 페이지 → iframe#mainFrame 안에 댓글 영역이 직접 렌더링됨 (별도 commentIframe 없음)
  2. 댓글 입력란: div.u_cbox_text[contenteditable="true"] (textarea 아님)
  3. 댓글 영역은 .btn_comment 클릭 후 lazy-load됨
  4. .btn_comment는 플로팅 바텀 버튼 — Playwright click 불가, JS click 필요
"""
import asyncio
import random

from playwright.async_api import Frame, Page

from config.settings import ELEMENT_TIMEOUT, MAX_POST_RETRIES, PAGE_LOAD_TIMEOUT
from src.auth.session_manager import is_session_valid, refresh_session
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

# 댓글 입력창 셀렉터 (contenteditable div 우선 → textarea 폴백)
_INPUT_SELECTORS = [
    ".u_cbox_text",                        # contenteditable div (현재 주력)
    "div.u_cbox_text_mention",             # 멘션 지원 div
    ".u_cbox_write_wrap textarea",         # 구형 textarea (폴백)
    ".u_cbox_write textarea",              # 구형 textarea (폴백)
    "textarea[placeholder*='댓글']",       # 범용 textarea 폴백
    "textarea",                            # 최후 폴백
]

# 댓글 열기 버튼 셀렉터
_COMMENT_OPEN_SELECTORS = [
    ".btn_comment",                        # 플로팅 바텀 버튼 (현재 주력)
    "a.btn_comment",                       # a 태그 형식
    "#btn_comment_2",                      # ID 기반
]

# 등록 버튼 셀렉터
_SUBMIT_SELECTORS = [
    ".u_cbox_btn_upload",
    "button.u_cbox_btn_upload",
    ".u_cbox_write_wrap button[type='submit']",
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


async def visit_and_extract(
    page: Page,
    post_url: str,
    my_blog_id: str | None = None,
    my_blog_ids: set[str] | None = None,
) -> tuple[str, bool | None]:
    """
    게시물 방문 → 읽기 시뮬레이션 → 본문 텍스트 추출 + 내 댓글 존재 확인.
    배치 댓글 생성을 위해 본문만 가져오고 댓글은 작성하지 않음.

    Args:
        my_blog_id: 대표 블로그 ID (하위 호환)
        my_blog_ids: 제외할 모든 블로그 ID 세트 (다중 ID 지원)

    Returns:
        (본문 텍스트, 내 댓글 존재 여부)
        my_blog_id/my_blog_ids 모두 미제공 시 존재 여부는 None.
    """
    # 제외 ID 세트 구성
    check_ids = my_blog_ids or (set() if not my_blog_id else {my_blog_id})
    if my_blog_id:
        check_ids.add(my_blog_id)

    try:
        await page.goto(post_url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("domcontentloaded", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(3)

        await _simulate_reading(page)

        target_frame = page.frame("mainFrame") or page.main_frame
        body = await _extract_post_body(target_frame)
        logger.debug(f"본문 추출 완료 ({len(body)}자): {post_url[:60]}")

        # 내 댓글 존재 확인
        my_comment_exists = None
        if check_ids:
            my_comment_exists = await _check_my_comment(target_frame, check_ids)

        return body, my_comment_exists
    except Exception as e:
        logger.warning(f"본문 추출 실패: {post_url[:60]} — {e}")
        return "", None


async def _check_my_comment(frame: Frame, my_blog_ids: set[str]) -> bool:
    """
    댓글 영역에서 내 blog_id(들)로 작성된 댓글이 있는지 확인.
    다중 블로그 ID를 지원하여 모든 부계정 댓글도 감지.
    """
    try:
        found = await frame.evaluate(
            """(myIds) => {
                // 댓글 영역의 모든 프로필 링크 검색
                const links = document.querySelectorAll(
                    '.u_cbox_info a[href], .u_cbox_nick a[href], ' +
                    '.u_cbox_comment_box a[href*="blog.naver.com"]'
                );
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    for (const myId of myIds) {
                        if (href.includes('blog.naver.com/' + myId) ||
                            href.includes('/' + myId)) {
                            return true;
                        }
                    }
                }
                // 닉네임 텍스트에서도 검색 (프로필 링크 없는 경우)
                const nicks = document.querySelectorAll(
                    '.u_cbox_nick, .u_cbox_name'
                );
                for (const nick of nicks) {
                    const onclick = nick.getAttribute('onclick') || '';
                    for (const myId of myIds) {
                        if (onclick.includes(myId)) {
                            return true;
                        }
                    }
                }
                return false;
            }""",
            list(my_blog_ids),
        )
        return bool(found)
    except Exception as e:
        logger.debug(f"내 댓글 확인 실패 (무시): {e}")
        return False


async def write_comment(
    page: Page,
    post_url: str,
    post_title: str,
    dry_run: bool = False,
    recent_comments: list[str] | None = None,
    context=None,  # 세션 갱신용
    naver_id: str | None = None,
    naver_pw: str | None = None,
    comment_text: str | None = None,
) -> tuple[bool, str]:
    """
    게시물 URL에 댓글 작성.
    Returns (success, comment_text)
    dry_run=True 이면 실제 제출 없이 시뮬레이션.
    comment_text: 미리 승인된 댓글 텍스트 (없으면 AI 생성)
    recent_comments: 최근 해당 블로거에게 단 댓글 목록 (중복 방지용)
    context/naver_id/naver_pw: 세션 만료 시 자동 갱신용 (선택)
    """
    comment_text = comment_text or ""
    recent_comments = recent_comments or []

    for attempt in range(1, MAX_POST_RETRIES + 1):
        try:
            # 세션 유효성 확인 (옵션 제공된 경우)
            if context and naver_id and naver_pw:
                is_valid = await is_session_valid(page)
                if not is_valid:
                    logger.warning("댓글 작성 중 세션 만료 감지 — 재로그인 시도")
                    refreshed = await refresh_session(context, page, naver_id, naver_pw)
                    if not refreshed:
                        logger.error("세션 갱신 실패 — 댓글 작성 중단")
                        return False, comment_text
            
            await page.goto(post_url, timeout=PAGE_LOAD_TIMEOUT)
            await page.wait_for_load_state("domcontentloaded", timeout=PAGE_LOAD_TIMEOUT)
            await asyncio.sleep(3)  # 추가 대기 (lazy load 대응)

            # 페이지 읽기 시뮬레이션 (재방문 시 짧은 체류)
            await _simulate_reading(page, brief=bool(comment_text))

            # mainFrame 확인
            target_frame = page.frame("mainFrame") or page.main_frame

            # 본문 추출 → AI 댓글 생성 (배치 미사용 시 단건 폴백)
            if not comment_text:
                post_body = await _extract_post_body(target_frame)
                comment_text = generate_comment(post_body, post_title, recent_comments)

            # 캡차 감지
            if await _is_captcha_present(page):
                logger.warning(f"캡차 감지 — 게시물 스킵: {post_url}")
                return False, comment_text

            # 댓글 영역 열기 (lazy-load)
            await _open_comment_area(target_frame)

            # 댓글 입력창 찾기
            input_el = await _find_comment_input(target_frame)
            if input_el is None:
                logger.warning(f"댓글 입력창 없음 — 게시물 스킵: {post_url}")
                return None, comment_text  # None = 게시물 자체 문제 (연속 실패 카운터 제외)

            success = await _fill_and_submit(target_frame, input_el, comment_text, dry_run)
            if success:
                logger.info(f"댓글 작성 {'(dry-run)' if dry_run else '완료'}: {post_url[:60]}")
                return True, comment_text

        except Exception as e:
            logger.warning(f"댓글 작성 오류 (시도 {attempt}/{MAX_POST_RETRIES}): {e}")
            if attempt < MAX_POST_RETRIES:
                await asyncio.sleep(3)

    return False, comment_text


async def _simulate_reading(page: Page, brief: bool = False) -> None:
    """페이지 체류 시간 시뮬레이션.
    brief=False: 본문 읽기 (15~45초) — 첫 방문용.
    brief=True:  재방문 체류 (3~8초) — 댓글 작성 재방문용."""
    if brief:
        # 재방문: 짧은 스크롤 1~2회 + 체류
        await asyncio.sleep(random.uniform(2.0, 4.0))
        try:
            target = page.frame("mainFrame") or page.main_frame
            scroll_count = random.randint(1, 2)
            for _ in range(scroll_count):
                await target.evaluate(f"window.scrollBy(0, {random.randint(100, 300)})")
                await asyncio.sleep(random.uniform(1.0, 3.0))
        except Exception:
            await asyncio.sleep(random.uniform(2.0, 4.0))
        return

    # 첫 방문: 본문 읽기 (15~45초)
    await asyncio.sleep(random.uniform(3.0, 6.0))
    try:
        target = page.frame("mainFrame") or page.main_frame
        scroll_count = random.randint(3, 5)
        for _ in range(scroll_count):
            scroll_amount = random.randint(200, 500)
            await target.evaluate(f"window.scrollBy(0, {scroll_amount})")
            await asyncio.sleep(random.uniform(3.0, 8.0))
    except Exception:
        await asyncio.sleep(random.uniform(5.0, 10.0))


async def _extract_post_body(frame: Frame) -> str:
    """게시물 본문 텍스트 추출."""
    for selector in _BODY_SELECTORS:
        try:
            el = await frame.query_selector(selector)
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
        body = await frame.query_selector("body")
        if body:
            text = await body.inner_text()
            logger.debug(f"본문 폴백 추출 (body 전체, {len(text)}자)")
            return text.strip()
    except Exception:
        pass

    logger.debug("본문 추출 실패 — 빈 문자열 반환")
    return ""


async def _open_comment_area(frame: Frame) -> None:
    """댓글 영역 열기 (lazy-load 대응).
    .btn_comment를 JS로 클릭해서 댓글 입력 UI를 활성화."""
    for selector in _COMMENT_OPEN_SELECTORS:
        try:
            clicked = await frame.evaluate(f'''() => {{
                const btn = document.querySelector("{selector}");
                if (btn) {{
                    btn.scrollIntoView({{behavior: "instant", block: "center"}});
                    btn.click();
                    return true;
                }}
                return false;
            }}''')
            if clicked:
                logger.debug(f"댓글 영역 열기 성공: {selector}")
                await asyncio.sleep(2)  # 댓글 UI 로드 대기
                return
        except Exception:
            continue

    logger.debug("댓글 열기 버튼 없음 — 이미 열려있거나 댓글 비허용")


async def _find_comment_input(frame: Frame) -> object | None:
    """댓글 입력창(contenteditable div 또는 textarea) 탐색.
    첫 번째(주력) 셀렉터에 ELEMENT_TIMEOUT 사용, 나머지 폴백은 2초.
    입력창 없는 게시물에서 ~60초 대기 -> ~14초로 단축."""
    FALLBACK_TIMEOUT = 2000  # 폴백 셀렉터 타임아웃 (2초)

    for idx, selector in enumerate(_INPUT_SELECTORS):
        timeout = ELEMENT_TIMEOUT if idx == 0 else FALLBACK_TIMEOUT
        try:
            el = await frame.wait_for_selector(selector, timeout=timeout)
            if el:
                logger.debug(f"댓글 입력창 발견: {selector}")
                return el
        except Exception:
            continue
    return None


async def _fill_and_submit(
    frame: Frame, input_el: object, text: str, dry_run: bool
) -> bool:
    """
    댓글 입력창에 텍스트 입력 후 제출.
    contenteditable div와 textarea 양쪽을 지원.
    """
    # 클릭 후 포커스 (JS 클릭 — viewport 문제 우회)
    try:
        await input_el.evaluate("e => { e.scrollIntoView({block: 'center'}); e.click(); e.focus(); }")
    except Exception:
        try:
            await input_el.click()
        except Exception:
            logger.debug("입력창 포커스 실패")
            return False
    await delay_short()

    # contenteditable인지 확인
    is_contenteditable = await input_el.evaluate(
        "e => e.getAttribute('contenteditable') === 'true'"
    )

    if is_contenteditable:
        # contenteditable div: keyboard.type()으로 입력
        # 가우시안 분포 — 평균 55ms, σ=15ms, 사람 타이핑 리듬 모사
        typing_delay = int(max(20, min(120, random.gauss(55, 15))))
        await frame.page.keyboard.type(text, delay=typing_delay)
    else:
        # textarea: 글자 단위 타이핑 (가우시안 딜레이)
        for char in text:
            char_delay = int(max(15, min(100, random.gauss(50, 12))))
            await input_el.type(char, delay=char_delay)

    await delay_short()

    if dry_run:
        logger.info(f"[dry-run] 입력 완료 (제출 생략): {text[:40]}...")
        # 입력 내용 지우기
        try:
            if is_contenteditable:
                await input_el.evaluate("e => e.textContent = ''")
            else:
                await input_el.fill("")
        except Exception:
            pass
        return True

    # 공지사항 팝업 닫기
    try:
        close_notice = await frame.query_selector('.u_cbox_notice_close, [class*="notice_close"], button[onclick*="close"]')
        if close_notice:
            await close_notice.click()
            await asyncio.sleep(0.5)
            logger.debug("공지사항 팝업 닫기")
    except Exception:
        pass
    
    # 등록 버튼 대기 — 댓글 모듈이 비동기로 로그인 상태를 확인하므로
    # 타이핑 후 최대 10초까지 버튼이 visible 해질 때까지 기다림
    submit_btn = None
    for selector in _SUBMIT_SELECTORS:
        try:
            btn = await frame.wait_for_selector(selector, state="visible", timeout=10_000)
            if btn:
                submit_btn = btn
                logger.debug(f"등록 버튼 선택: {selector}")
                break
        except Exception:
            continue

    if not submit_btn:
        logger.warning("제출 버튼을 찾지 못했습니다")
        return False

    # JS 클릭 (viewport 문제 우회)
    try:
        await submit_btn.evaluate("e => { e.scrollIntoView({block: 'center'}); e.click(); }")
    except Exception:
        await submit_btn.click()
    await asyncio.sleep(3)  # 제출 후 반응 대기

    # 제출 후 캡차 재확인
    try:
        if await _is_captcha_present(frame.page):
            logger.warning("댓글 제출 후 캡차 발생")
            return False
    except Exception:
        pass

    # 실제 제출 성공 여부 확인
    # 방법 1: 입력창이 비워졌는지 확인 (제출 성공 시 초기화됨)
    # 네이버 cbox가 비동기로 처리하므로 최대 3회(3초 간격) 재확인
    input_cleared = None
    for check in range(3):
        try:
            current_text = await input_el.evaluate("e => e.textContent || e.value || ''")
            if not current_text or len(current_text.strip()) == 0:
                input_cleared = True
                break
            if check < 2:
                logger.debug(f"입력창 미비워짐 — {check+1}회 재확인 대기")
                await asyncio.sleep(3)
        except Exception as e:
            # 입력창 요소 자체가 사라진 경우 → 제출 성공으로 간주
            logger.debug(f"입력창 확인 중 오류 (성공으로 간주): {e}")
            input_cleared = True
            break
    if input_cleared is None:
        # 3회 확인 후에도 비워지지 않음 → 제출 실패
        logger.warning("댓글 제출 후 입력창이 비워지지 않음 — 제출 실패로 처리")
        return False
    
    # 방법 2: 성공 메시지 확인
    try:
        success_notice = await frame.query_selector('.u_cbox_notice, .u_cbox_write_success')
        if success_notice:
            notice_text = await success_notice.inner_text()
            logger.info(f"댓글 작성 성공 확인: {notice_text[:50]}")
    except Exception:
        pass

    logger.info("댓글 작성 완료")

    # 공감 버튼 클릭 (댓글 작성 성공 후)
    try:
        await _click_like_button(frame)
    except Exception as e:
        logger.debug(f"공감 클릭 실패 (무시): {e}")

    return True


async def _click_like_button(frame: Frame) -> None:
    """게시물 공감(좋아요) 버튼 클릭. 이미 공감한 상태면 스킵."""
    # 이미 공감한 상태 확인 (on 클래스)
    on_btn = await frame.query_selector("a.u_likeit_list_button._button.on.double_heart")
    if on_btn:
        logger.debug("이미 공감한 게시물 — 스킵")
        return

    # 공감 버튼 찾기 (off 상태)
    like_btn = await frame.query_selector("a.u_likeit_list_button._button.off.double_heart")
    if not like_btn:
        # 폴백: 첫 번째 off 버튼
        like_btn = await frame.query_selector("a.u_likeit_list_button._button.off")
    if not like_btn:
        logger.debug("공감 버튼 없음")
        return

    # scrollIntoView 후 JS 클릭 (viewport 밖이면 일반 click 실패)
    await like_btn.evaluate("e => { e.scrollIntoView({block: 'center'}); e.click(); }")
    await asyncio.sleep(1)
    logger.info("공감 클릭 완료")


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

"""
대댓글(답글) 작성 모듈 — 모바일 Playwright로 네이버 블로그 답글 게시.

내 블로그 게시물의 특정 댓글에 대댓글을 작성한다.
모바일 페이지(m.blog.naver.com)에서 동작.

흐름:
  1. 게시물 방문 (모바일)
  2. 댓글 영역 열기
  3. 해당 comment_no의 "답글" 버튼 클릭
  4. 답글 입력창에 텍스트 입력
  5. "등록" 버튼 클릭
  6. 성공 확인
"""
import asyncio
import random

from playwright.async_api import Page

from config.settings import COMMENT_LOAD_WAIT
from src.utils.logger import setup_logger

logger = setup_logger("reply_writer")

# 답글 관련 셀렉터
_REPLY_BTN_SELECTOR = 'a.u_cbox_btn_reply[data-action="reply#toggle"]'
_REPLY_INPUT_ID_PREFIX = "naverComment__reply_textarea_"
_REPLY_SUBMIT_CLASS_PREFIX = "u_cbox_btn_upload __uis_naverComment_replyButton_"


async def write_reply(
    page: Page,
    post_url: str,
    comment_no: str,
    reply_text: str,
    dry_run: bool = False,
) -> bool:
    """
    특정 댓글에 대댓글(답글) 작성.

    Args:
        page: 모바일 Playwright 페이지 (로그인된 상태)
        post_url: 게시물 URL (모바일)
        comment_no: 대상 댓글 번호 (data-param)
        reply_text: 답글 텍스트
        dry_run: True면 입력까지만, 등록 안 함

    Returns:
        성공 여부
    """
    logger.info(f"답글 작성 시작: comment_no={comment_no[:12]}...")

    # 1. 게시물 방문
    mobile_url = _ensure_mobile_url(post_url)
    await page.goto(mobile_url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)

    # 2. 댓글 영역 열기
    opened = await _open_comment_area(page)
    if not opened:
        logger.warning("댓글 영역 열기 실패")
        return False

    # 3. 해당 댓글의 답글 버튼 클릭
    clicked = await _click_reply_button(page, comment_no)
    if not clicked:
        logger.warning(f"답글 버튼 클릭 실패: {comment_no[:12]}")
        return False

    # 4. 답글 입력창 찾기 + 텍스트 입력
    filled = await _fill_reply_text(page, comment_no, reply_text)
    if not filled:
        logger.warning("답글 입력 실패")
        return False

    if dry_run:
        logger.info(f"[DRY-RUN] 답글 입력 완료 (등록 안 함): {reply_text[:40]}...")
        return True

    # 5. 등록 버튼 클릭
    submitted = await _submit_reply(page, comment_no)
    if not submitted:
        logger.warning("답글 등록 실패")
        return False

    logger.info(f"답글 등록 완료: {reply_text[:40]}...")
    return True


def _ensure_mobile_url(url: str) -> str:
    """URL을 모바일 형식으로 변환."""
    return url.replace("://blog.naver.com", "://m.blog.naver.com")


async def _open_comment_area(page: Page) -> bool:
    """댓글 영역 열기 (lazy-load 트리거)."""
    selectors = ['[class*="comment_btn"]', 'a._commentCount']
    for sel in selectors:
        btn = await page.query_selector(sel)
        if btn:
            await btn.click()
            await page.wait_for_timeout(COMMENT_LOAD_WAIT * 1000)
            return True
    # 이미 열려있을 수 있음
    boxes = await page.query_selector_all('.u_cbox_comment_box')
    return len(boxes) > 0


async def _click_reply_button(page: Page, comment_no: str) -> bool:
    """해당 댓글의 답글 버튼 클릭. 보안: comment_no를 JS 인자로 전달."""
    # JS로 해당 comment_no의 답글 버튼 찾아 클릭
    result = await page.evaluate(
        """(commentNo) => {
            const buttons = document.querySelectorAll(
                'a.u_cbox_btn_reply[data-action="reply#toggle"]'
            );
            for (const btn of buttons) {
                const param = btn.getAttribute('data-param');
                if (param === commentNo) {
                    btn.click();
                    return true;
                }
            }
            return false;
        }""",
        comment_no,
    )

    if not result:
        return False

    # 답글 영역이 표시될 때까지 대기
    await page.wait_for_timeout(2000)
    return True


async def _fill_reply_text(page: Page, comment_no: str, text: str) -> bool:
    """답글 입력창에 텍스트 입력. 인간적 타이핑 시뮬레이션."""
    input_id = f"{_REPLY_INPUT_ID_PREFIX}{comment_no}"

    # 입력창 대기
    try:
        input_el = await page.wait_for_selector(
            f"#{input_id}",
            state="visible",
            timeout=10000,
        )
    except Exception:
        # ID로 못 찾으면 reply_area 안의 입력창 탐색
        input_el = await page.query_selector(
            '.u_cbox_reply_area:not([style*="display:none"]) .u_cbox_text[contenteditable]'
        )

    if not input_el:
        return False

    # 포커스 + 클릭
    await input_el.click()
    await page.wait_for_timeout(500)

    # placeholder(가이드 텍스트) 숨기기
    await page.evaluate(
        """(commentNo) => {
            const guide = document.querySelector(
                '.u_cbox_reply_area:not([style*="display:none"]) .u_cbox_guide'
            );
            if (guide) guide.style.display = 'none';
        }""",
        comment_no,
    )

    # 인간적 타이핑: 한 글자씩 입력
    for char in text:
        await input_el.type(char, delay=max(15, min(120, random.gauss(50, 15))))
        # 문장부호 뒤 짧은 멈춤
        if char in '.!?,':
            await page.wait_for_timeout(random.randint(100, 300))

    await page.wait_for_timeout(500)
    return True


async def _submit_reply(page: Page, comment_no: str) -> bool:
    """답글 등록 버튼 클릭."""
    # 방법 1: commentNo 특정 등록 버튼
    submitted = await page.evaluate(
        """(commentNo) => {
            // 등록 버튼 클래스: u_cbox_btn_upload + __uis_naverComment_replyButton_{commentNo}
            const selector = `button.__uis_naverComment_replyButton_${commentNo}`;
            const btn = document.querySelector(selector);
            if (btn) {
                btn.click();
                return true;
            }
            // 폴백: reply_area 안의 등록 버튼
            const area = document.querySelector(
                '.u_cbox_reply_area:not([style*="display:none"])'
            );
            if (area) {
                const uploadBtn = area.querySelector('.u_cbox_btn_upload');
                if (uploadBtn) {
                    uploadBtn.click();
                    return true;
                }
            }
            return false;
        }""",
        comment_no,
    )

    if not submitted:
        return False

    # 등록 완료 대기
    await page.wait_for_timeout(3000)

    # 입력창이 비워졌는지 확인 (성공 지표)
    input_id = f"{_REPLY_INPUT_ID_PREFIX}{comment_no}"
    is_empty = await page.evaluate(
        """(inputId) => {
            const el = document.getElementById(inputId);
            if (!el) return true;  // 입력창 사라짐 = 성공
            return el.textContent?.trim()?.length === 0;
        }""",
        input_id,
    )

    return is_empty

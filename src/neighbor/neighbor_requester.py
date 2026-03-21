"""
서로이웃 신청 자동화 — Playwright로 네이버 블로그 이웃 신청.

흐름:
  1. 블로그 방문
  2. 프로필 영역에서 "이웃추가" 버튼 클릭
  3. "서로이웃 신청" 옵션 선택
  4. 메시지 입력
  5. 확인 클릭
"""
import asyncio

from playwright.async_api import Page

from src.utils.logger import setup_logger

logger = setup_logger("neighbor_requester")

# 일일 신청 카운터 — 사용자별 분리 (프로세스 수명 동안 유지)
_daily_counts: dict[str, int] = {}
_daily_date: str | None = None


def _check_daily_limit(max_per_day: int, user_id: str = "default") -> bool:
    """일일 한도 확인. True면 신청 가능."""
    global _daily_counts, _daily_date
    from datetime import date
    today = date.today().isoformat()
    if _daily_date != today:
        _daily_counts = {}
        _daily_date = today
    return _daily_counts.get(user_id, 0) < max_per_day


def _increment_daily(user_id: str = "default"):
    _daily_counts[user_id] = _daily_counts.get(user_id, 0) + 1


async def send_neighbor_request(
    page: Page,
    blog_id: str,
    message: str = "",
    max_per_day: int = 10,
    user_id: str = "default",
) -> dict:
    """
    서로이웃 신청 실행.

    Args:
        page: Playwright Page (로그인된 상태)
        blog_id: 대상 블로그 ID
        message: 신청 메시지 (빈 문자열이면 기본 메시지)
        max_per_day: 일일 최대 신청 수
        user_id: 사용자 ID (다중 사용자 일일 카운터 분리용)

    Returns:
        {"success": bool, "message": str}
    """
    if not _check_daily_limit(max_per_day, user_id):
        return {"success": False, "message": f"일일 신청 한도 초과 ({max_per_day}건)"}

    try:
        blog_url = f"https://blog.naver.com/{blog_id}"
        await page.goto(blog_url, wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(2000)

        # mainFrame 탐색
        target_frame = page.main_frame
        for frame in page.frames:
            if "blog.naver.com" in (frame.url or ""):
                target_frame = frame
                break

        # "이웃추가" 버튼 찾기
        add_btn = await target_frame.query_selector(
            'a[class*="buddy_add"], button[class*="neighbor_add"], '
            'a[href*="BuddyAdd"], .btn_buddy_add'
        )

        if not add_btn:
            return {"success": False, "message": "이웃추가 버튼을 찾을 수 없습니다 (이미 이웃이거나 비공개 블로그)"}

        # 이웃추가 버튼 클릭
        await add_btn.click()
        await page.wait_for_timeout(1500)

        # 서로이웃 신청 팝업/모달 처리
        # "서로이웃 신청" 라디오/옵션 선택
        mutual_option = await page.query_selector(
            'input[value="mutual"], label:has-text("서로이웃"), '
            '[class*="mutual"], input[name="buddyType"][value="2"]'
        )
        if mutual_option:
            await mutual_option.click()
            await page.wait_for_timeout(500)

        # 메시지 입력
        if message:
            msg_input = await page.query_selector(
                'textarea[name="buddyMemo"], textarea[class*="buddy_memo"], '
                'textarea[placeholder*="메시지"], .buddy_memo textarea'
            )
            if msg_input:
                await msg_input.fill("")
                await msg_input.type(message, delay=50)
                await page.wait_for_timeout(300)

        # 확인/신청 버튼 클릭
        confirm_btn = await page.query_selector(
            'button:has-text("확인"), button:has-text("신청"), '
            'a:has-text("확인"), .btn_confirm, .btn_ok'
        )
        if not confirm_btn:
            return {"success": False, "message": "확인 버튼을 찾을 수 없습니다"}

        await confirm_btn.click()
        await page.wait_for_timeout(2000)

        _increment_daily(user_id)
        logger.info(f"서로이웃 신청 완료: {blog_id} (오늘 {_daily_counts.get(user_id, 0)}건)")
        return {"success": True, "message": f"서로이웃 신청 완료: {blog_id}"}

    except asyncio.TimeoutError:
        return {"success": False, "message": f"시간 초과: {blog_id}"}
    except Exception as e:
        logger.error(f"서로이웃 신청 실패 ({blog_id}): {e}")
        return {"success": False, "message": str(e)[:200]}

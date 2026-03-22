"""
서로이웃 신청 자동화 — Playwright로 네이버 블로그 이웃 신청.

흐름:
  1. 블로그 방문 → PostList iframe에서 "이웃추가" 버튼 클릭
  2. BuddyAdd 팝업 창 열림
  3. "서로이웃" 라디오(label) 클릭
  4. 메시지 입력
  5. 확인 클릭
"""
import asyncio

from playwright.async_api import BrowserContext, Page

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
    context: BrowserContext | None = None,
) -> dict:
    """
    서로이웃 신청 실행.

    Args:
        page: Playwright Page (로그인된 상태)
        blog_id: 대상 블로그 ID
        message: 신청 메시지 (빈 문자열이면 기본 메시지)
        max_per_day: 일일 최대 신청 수
        user_id: 사용자 ID (다중 사용자 일일 카운터 분리용)
        context: BrowserContext (팝업 감지용, 없으면 page.context 사용)

    Returns:
        {"success": bool, "message": str}
    """
    if not _check_daily_limit(max_per_day, user_id):
        return {"success": False, "message": f"일일 신청 한도 초과 ({max_per_day}건)"}

    ctx = context or page.context

    try:
        blog_url = f"https://blog.naver.com/{blog_id}"
        await page.goto(blog_url, wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(2000)

        # PostList iframe 탐색 (이웃추가 버튼이 있는 프레임)
        target_frame = None
        for frame in page.frames:
            frame_url = frame.url or ""
            if "PostList.naver" in frame_url or "PostView.naver" in frame_url:
                target_frame = frame
                break
        if not target_frame:
            for frame in page.frames:
                if frame != page.main_frame and "blog.naver.com" in (frame.url or ""):
                    target_frame = frame
                    break
        if not target_frame:
            target_frame = page.main_frame

        # "이웃추가" 버튼 찾기
        add_btn = await target_frame.query_selector(
            "a.btn_addbuddy, a.btn_add_nb._addBuddyPop"
        )

        if not add_btn:
            return {
                "success": False,
                "message": "이웃추가 버튼을 찾을 수 없습니다 (이미 이웃이거나 비공개 블로그)",
            }

        # 팝업 감지 준비
        popup_future = asyncio.get_event_loop().create_future()

        def on_popup(p):
            if not popup_future.done():
                popup_future.set_result(p)

        ctx.on("page", on_popup)

        # 이웃추가 버튼 클릭 → 팝업 열림
        await add_btn.click()

        try:
            popup = await asyncio.wait_for(popup_future, timeout=10)
        except asyncio.TimeoutError:
            return {"success": False, "message": "이웃추가 팝업이 열리지 않습니다"}
        finally:
            ctx.remove_listener("page", on_popup)

        await popup.wait_for_load_state("domcontentloaded")
        await popup.wait_for_timeout(1500)

        # "서로이웃" 라디오 선택 (label 클릭으로 — input이 label에 가려짐)
        mutual_radio = await popup.query_selector(
            'input[name="relation"][value="1"]'
        )
        if mutual_radio:
            disabled = await mutual_radio.get_attribute("disabled")
            if disabled:
                await popup.close()
                return {
                    "success": False,
                    "message": "서로이웃 신청 불가 (상대방이 서로이웃을 받지 않음)",
                }
            # label 클릭 (input 직접 클릭 시 label이 가로챔)
            label = await popup.query_selector('label[for="each_buddy_add"]')
            if label:
                await label.click()
            else:
                await mutual_radio.click(force=True)
            await popup.wait_for_timeout(500)

        # 1단계 "다음" 버튼 클릭 (이웃 유형 선택 → 메시지 입력)
        next_btn = await popup.query_selector(
            'a._buddyAddNext, a.button_next'
        )
        if not next_btn:
            await popup.close()
            return {"success": False, "message": "다음 버튼을 찾을 수 없습니다"}

        await next_btn.click()
        await popup.wait_for_timeout(2000)

        # 2단계: 메시지 입력
        if message:
            msg_input = await popup.query_selector(
                'textarea._bothBuddyAddMessage, '
                'textarea[name="message"], textarea'
            )
            if msg_input:
                await msg_input.fill("")
                await msg_input.type(message, delay=30)
                await popup.wait_for_timeout(300)

        # 2단계 "다음"/"확인" 버튼 클릭 (신청 완료)
        confirm_btn = await popup.query_selector(
            'a._addBothBuddy, a.button_next, '
            'a:has-text("확인"), button:has-text("확인")'
        )
        if not confirm_btn:
            await popup.close()
            return {"success": False, "message": "확인 버튼을 찾을 수 없습니다"}

        await confirm_btn.click()
        await popup.wait_for_timeout(3000)

        # 팝업이 자동으로 닫혔는지 확인
        if not popup.is_closed():
            await popup.close()

        _increment_daily(user_id)
        logger.info(
            f"서로이웃 신청 완료: {blog_id} "
            f"(오늘 {_daily_counts.get(user_id, 0)}건)"
        )
        return {"success": True, "message": f"서로이웃 신청 완료: {blog_id}"}

    except asyncio.TimeoutError:
        return {"success": False, "message": f"시간 초과: {blog_id}"}
    except Exception as e:
        logger.error(f"서로이웃 신청 실패 ({blog_id}): {e}")
        return {"success": False, "message": str(e)[:200]}

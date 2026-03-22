"""
텔레그램 알림 유틸리티 — 긴급 알림 + 명령 결과 알림 (멀티유저)

사용 흐름:
  notify_login_failure(error_msg) → 텔레그램 봇으로 즉시 알림 전송
  notify_command_result(user_id, command, result) → 명령 완료 알림
  notify_command_failure(user_id, command, error) → 명령 실패 알림
"""
import os

import httpx

from src.utils.logger import logger

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")


async def send_telegram_message(message: str, chat_id: str | None = None) -> bool:
    """
    텔레그램 봇으로 메시지 전송.
    chat_id가 None이면 .env의 TELEGRAM_CHAT_ID 사용.
    """
    target_chat_id = chat_id or TELEGRAM_CHAT_ID
    if not TELEGRAM_BOT_TOKEN or not target_chat_id:
        logger.warning("텔레그램 설정 없음 — 알림 생략")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": target_chat_id,
        "text": message,
        "parse_mode": "Markdown",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                logger.info(f"텔레그램 알림 전송 완료 (chat_id={target_chat_id})")
                return True
            else:
                logger.warning(f"텔레그램 알림 실패: HTTP {resp.status_code}")
                return False
    except Exception as e:
        logger.error(f"텔레그램 알림 전송 오류: {e}")
        return False


def _get_chat_id_for_user(user_id: str) -> str | None:
    """user_id → telegram_chat_id 조회 (캐시 포함)."""
    try:
        from src.storage.supabase_client import get_chat_id_for_user
        return get_chat_id_for_user(user_id)
    except Exception as e:
        logger.error(f"chat_id 조회 실패: {e}")
        return None


def _format_result_message(command: str, result: dict) -> str:
    """명령 타입별 결과 메시지 포맷팅."""
    formatters = {
        "run": lambda r: (
            f"✅ 봇 실행 완료\n"
            f"방문 {r.get('bloggers_visited', 0)}명, "
            f"댓글 {r.get('comments_written', 0)}개"
        ),
        "execute": lambda r: (
            f"✅ 댓글 게시: 성공 {r.get('success', 0)} / 실패 {r.get('failed', 0)}"
        ),
        "retry": lambda r: (
            f"✅ 재시도: 성공 {r.get('success', 0)} / 실패 {r.get('failed', 0)}"
        ),
        "discover_neighbors": lambda r: (
            f"✅ 이웃 발견: {r.get('discovered', 0)}명"
        ),
        "visit_neighbors": lambda r: (
            f"✅ 이웃 방문: {r.get('visited', 0)}명, "
            f"댓글 {r.get('comments_generated', 0)}개"
        ),
        "neighbor_request": lambda r: (
            f"✅ 서로이웃 신청: {r.get('message', '완료')}"
        ),
        "discover_and_visit": lambda r: (
            f"✅ 찾기+방문 완료\n"
            f"발견 {r.get('discovered', 0)}명 → 방문 {r.get('visited', 0)}명, "
            f"댓글 {r.get('comments_generated', 0)}개"
        ),
        "publish": lambda r: (
            f"✅ 게시물 발행 완료\n{r.get('post_url', '')}"
        ),
    }

    formatter = formatters.get(command)
    if formatter:
        return formatter(result)
    return f"✅ `{command}` 완료\n{result.get('message', '')}"


async def notify_command_result(
    user_id: str, command: str, result: dict
) -> bool:
    """명령 완료 시 해당 사용자 텔레그램으로 결과 알림 전송."""
    chat_id = _get_chat_id_for_user(user_id)
    if not chat_id:
        logger.debug(f"사용자 {user_id[:8]} chat_id 없음 — 알림 생략")
        return False

    message = _format_result_message(command, result)
    return await send_telegram_message(message, chat_id=chat_id)


async def notify_command_failure(
    user_id: str, command: str, error: str,
    command_id: str | None = None,
) -> bool:
    """명령 실패 시 해당 사용자 텔레그램으로 실패 알림 + 재시도 버튼 전송."""
    chat_id = _get_chat_id_for_user(user_id)
    if not chat_id:
        logger.debug(f"사용자 {user_id[:8]} chat_id 없음 — 알림 생략")
        return False

    message = f"❌ <b>{command}</b> 실패\n{error[:300]}"

    # 재시도 버튼 포함 전송
    reply_markup = None
    if command_id:
        reply_markup = {
            "inline_keyboard": [[
                {"text": "🔄 재시도", "callback_data": f"retry_cmd:{command_id}"},
            ]]
        }

    return await _send_telegram_with_buttons(chat_id, message, reply_markup)


async def _send_telegram_with_buttons(
    chat_id: str, message: str, reply_markup: dict | None = None
) -> bool:
    """텔레그램 메시지 전송 (인라인 버튼 포함)."""
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            return resp.status_code == 200
    except Exception as e:
        logger.error(f"텔레그램 버튼 메시지 전송 오류: {e}")
        return False


async def notify_login_failure(error_detail: str) -> None:
    """로그인 실패 시 긴급 알림."""
    message = f"""🚨 *[로그인 오류]*

{error_detail}

조치 필요:
1. `python force_login.py` 실행
2. 수동 로그인 완료 후 쿠키 저장
3. 댓글 봇 재시작

⏰ 발생 시각: 현재"""

    await send_telegram_message(message)


async def notify_captcha_detected(post_url: str) -> None:
    """캡차 감지 시 알림."""
    message = f"""⚠️ *[캡차 감지]*

게시물: `{post_url[:50]}...`

상태: 댓글 작성 스킵됨

💡 _일정 시간 후 자동 재시도됩니다._"""

    await send_telegram_message(message)


async def notify_session_expired() -> None:
    """세션 만료 시 알림."""
    message = """🔒 *[세션 만료]*

네이버 로그인 세션이 만료되었습니다.

자동 재로그인을 시도합니다..."""

    await send_telegram_message(message)

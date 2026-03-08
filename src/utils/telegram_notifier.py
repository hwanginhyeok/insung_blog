"""
텔레그램 알림 유틸리티 — 로그인 실패 등 긴급 상황 알림

사용 흐름:
  notify_login_failure(error_msg) → 텔레그램 봇으로 즉시 알림 전송
"""
import os

import httpx

from src.utils.logger import logger

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")


async def send_telegram_message(message: str) -> bool:
    """
    텔레그램 봇으로 메시지 전송
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.warning("텔레그램 설정 없음 — 알림 생략")
        return False
    
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown",
    }
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                logger.info("텔레그램 알림 전송 완료")
                return True
            else:
                logger.warning(f"텔레그램 알림 실패: HTTP {resp.status_code}")
                return False
    except Exception as e:
        logger.error(f"텔레그램 알림 전송 오류: {e}")
        return False


async def notify_login_failure(error_detail: str) -> None:
    """
    로그인 실패 시 긴급 알림
    """
    message = f"""🚨 *[로그인 오류]*

{error_detail}

조치 필요:
1. `python force_login.py` 실행
2. 수동 로그인 완료 후 쿠키 저장
3. 댓글 봇 재시작

⏰ 발생 시각: 현재"""
    
    await send_telegram_message(message)


async def notify_captcha_detected(post_url: str) -> None:
    """
    캡차 감지 시 알림
    """
    message = f"""⚠️ *[캡차 감지]*

게시물: `{post_url[:50]}...`

상태: 댓글 작성 스킵됨

💡 _일정 시간 후 자동 재시도됩니다._"""
    
    await send_telegram_message(message)


async def notify_session_expired() -> None:
    """
    세션 만료 시 알림
    """
    message = """🔒 *[세션 만료]*

네이버 로그인 세션이 만료되었습니다.

자동 재로그인을 시도합니다..."""
    
    await send_telegram_message(message)

"""
텔레그램 알림 유틸리티 — 단방향 관리자 전용 알림.

**2026-04-11 리팩터**: 양방향 봇 기능 제거. 모든 알림을 관리자 채팅으로만 전송.
  - chat_id 파라미터는 호환을 위해 유지하되 무시 (관리자 채팅으로 redirect)
  - user_id가 있는 알림은 이름/이메일 prefix 추가 ("👤 홍길동 · ...")
  - 재시도 인라인 버튼 제거 (웹에서 관리)

사용:
  notify_login_failure(error_msg)                  → 로그인 실패 알림
  notify_command_result(user_id, command, result)  → 명령 완료 알림
  notify_command_failure(user_id, command, error)  → 명령 실패 알림
  notify_captcha_detected(post_url)                → 캡차 감지
  notify_session_expired()                         → 세션 만료
"""
import os
from functools import lru_cache

import httpx

from src.utils.logger import logger

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ADMIN_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")


# ───────────────────────────────────────────────
# 사용자 이름 조회 (prefix용)
# ───────────────────────────────────────────────

@lru_cache(maxsize=256)
def _get_user_label(user_id: str) -> str:
    """user_id → '이름 (id앞8자)' 형태 라벨. 조회 실패 시 id 앞 8자만."""
    if not user_id:
        return "시스템"
    try:
        from src.storage.supabase_client import get_supabase
        sb = get_supabase()
        result = (
            sb.table("users")
            .select("name, email")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if result.data:
            row = result.data[0]
            name = row.get("name") or row.get("email", "").split("@")[0]
            if name:
                return f"{name} ({user_id[:8]})"
    except Exception as e:
        logger.debug(f"user_label 조회 실패 user={user_id[:8]}: {e}")
    return user_id[:8]


def _user_prefix(user_id: str | None) -> str:
    """메시지 prefix. user_id가 없으면 빈 문자열."""
    if not user_id:
        return ""
    return f"👤 <b>{_get_user_label(user_id)}</b>\n"


# ───────────────────────────────────────────────
# 관리자 채팅 전송 (모든 알림의 공통 경로)
# ───────────────────────────────────────────────

async def send_telegram_message(message: str, chat_id: str | None = None) -> bool:
    """
    텔레그램 관리자 채팅으로 메시지 전송.

    2026-04-11 이후: chat_id 파라미터는 호환을 위해 유지되지만 무시됩니다.
    모든 메시지는 .env의 TELEGRAM_CHAT_ID(관리자)로 전송됩니다.
    """
    if not TELEGRAM_BOT_TOKEN or not ADMIN_CHAT_ID:
        logger.warning("텔레그램 설정 없음 (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) — 알림 생략")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": ADMIN_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                logger.info("텔레그램 관리자 알림 전송 완료")
                return True
            logger.warning(
                f"텔레그램 알림 실패: HTTP {resp.status_code} — {resp.text[:200]}"
            )
            return False
    except Exception as e:
        logger.error(f"텔레그램 알림 전송 오류: {e}")
        return False


# ───────────────────────────────────────────────
# 명령 결과/실패 알림 (worker가 호출)
# ───────────────────────────────────────────────

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
    return f"✅ <code>{command}</code> 완료\n{result.get('message', '')}"


async def notify_command_result(
    user_id: str, command: str, result: dict
) -> bool:
    """명령 완료 → 관리자 텔레그램에 '누가 무엇을 했는지' 알림."""
    prefix = _user_prefix(user_id)
    body = _format_result_message(command, result)
    return await send_telegram_message(f"{prefix}{body}")


async def notify_command_failure(
    user_id: str, command: str, error: str,
    command_id: str | None = None,
) -> bool:
    """명령 실패 → 관리자 텔레그램 알림. command_id는 로깅용(버튼 제거됨)."""
    prefix = _user_prefix(user_id)
    body = f"❌ <b>{command}</b> 실패\n<code>{error[:500]}</code>"
    if command_id:
        body += f"\n<i>command_id: {command_id[:8]}</i>"
    return await send_telegram_message(f"{prefix}{body}")


# ───────────────────────────────────────────────
# 시스템 이벤트 알림 (기존 호환)
# ───────────────────────────────────────────────

async def notify_login_failure(error_detail: str) -> None:
    """로그인 실패 시 긴급 알림."""
    message = (
        f"🚨 <b>[로그인 오류]</b>\n\n"
        f"<code>{error_detail[:500]}</code>\n\n"
        f"조치: <code>python force_login.py</code> → 수동 로그인 → 쿠키 저장 → 봇 재시작"
    )
    await send_telegram_message(message)


async def notify_captcha_detected(post_url: str) -> None:
    """캡차 감지 시 알림."""
    message = (
        f"⚠️ <b>[캡차 감지]</b>\n\n"
        f"게시물: <code>{post_url[:80]}</code>\n"
        f"상태: 댓글 작성 스킵됨\n"
        f"💡 일정 시간 후 자동 재시도됩니다."
    )
    await send_telegram_message(message)


async def notify_session_expired() -> None:
    """세션 만료 시 알림."""
    message = (
        "🔒 <b>[세션 만료]</b>\n\n"
        "네이버 로그인 세션이 만료되었습니다.\n"
        "자동 재로그인을 시도합니다..."
    )
    await send_telegram_message(message)


# ───────────────────────────────────────────────
# 신규: 웹 이벤트 알림 (사용자 요청)
# ───────────────────────────────────────────────

async def notify_user_activity(
    user_id: str, activity: str, detail: str = ""
) -> bool:
    """
    사용자 활동 알림 (웹 이벤트용).

    예: 신규 가입, 글 생성, 결제, 구독 시작 등
    """
    prefix = _user_prefix(user_id)
    body = f"📣 <b>{activity}</b>"
    if detail:
        body += f"\n{detail}"
    return await send_telegram_message(f"{prefix}{body}")


async def notify_bug_report(
    title: str, detail: str, user_id: str | None = None, source: str = "web"
) -> bool:
    """
    버그/에러 알림.

    source: "web" (support_tickets) | "api" (5xx) | "worker" | "auth"
    """
    prefix = _user_prefix(user_id) if user_id else ""
    body = (
        f"🐛 <b>[{source.upper()}] {title}</b>\n\n"
        f"<code>{detail[:800]}</code>"
    )
    return await send_telegram_message(f"{prefix}{body}")

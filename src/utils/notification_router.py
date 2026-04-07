"""
알림 라우터 — 다중 채널 알림 발송 (텔레그램/FCM/카카오).

현재 활성: 텔레그램
준비됨 (설정 시 활성화): FCM 웹 푸시, 카카오 나에게 보내기

사용법:
  router = NotificationRouter()
  await router.send(user_id, "봇 실행 완료", level="user")
  await router.send_admin("긴급: 워커 다운")
"""
import json
import os
from enum import Enum

import httpx

from src.utils.logger import setup_logger

logger = setup_logger("notification_router")


class NotifyLevel(str, Enum):
    """알림 레벨. admin=관리자 전용, user=해당 사용자."""
    ADMIN = "admin"
    USER = "user"


class NotificationRouter:
    """다중 채널 알림 라우터."""

    def __init__(self):
        # 텔레그램 (항상 활성)
        self._tg_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self._tg_admin_chat = os.environ.get("TELEGRAM_CHAT_ID", "")

        # FCM (FIREBASE_SERVICE_ACCOUNT_KEY 설정 시 활성)
        self._fcm_enabled = bool(os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY"))

        # 카카오 나에게 보내기 (KAKAO_REST_API_KEY + 토큰 설정 시 활성)
        self._kakao_enabled = bool(
            os.environ.get("KAKAO_REST_API_KEY")
            and os.environ.get("KAKAO_ACCESS_TOKEN")
        )

    async def send(
        self, user_id: str, message: str, level: str = "user"
    ) -> bool:
        """사용자에게 알림 전송. 텔레그램 → FCM → 카카오 순 시도."""
        success = False

        # 텔레그램 (항상 시도)
        chat_id = self._get_chat_id(user_id)
        if chat_id:
            success = await self._send_telegram(message, chat_id)

        # FCM (텔레그램 실패 시 또는 추가 채널)
        if self._fcm_enabled and not success:
            success = await self._send_fcm(user_id, message)

        return success

    async def send_admin(self, message: str) -> bool:
        """관리자에게 알림 전송. 텔레그램 + 카카오 동시."""
        results = []

        # 텔레그램
        if self._tg_token and self._tg_admin_chat:
            results.append(
                await self._send_telegram(message, self._tg_admin_chat)
            )

        # 카카오 나에게 보내기
        if self._kakao_enabled:
            results.append(await self._send_kakao_memo(message))

        return any(results)

    # --- 텔레그램 ---

    async def _send_telegram(self, message: str, chat_id: str) -> bool:
        """텔레그램 메시지 전송."""
        if not self._tg_token:
            return False

        url = f"https://api.telegram.org/bot{self._tg_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML",
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    return True
                logger.warning(f"텔레그램 실패: HTTP {resp.status_code}")
                return False
        except Exception as e:
            logger.error(f"텔레그램 오류: {e}")
            return False

    # --- FCM 웹 푸시 ---

    async def _send_fcm(self, user_id: str, message: str) -> bool:
        """FCM 웹 푸시 전송. firebase-admin 필요."""
        try:
            import firebase_admin
            from firebase_admin import messaging

            if not firebase_admin._apps:
                cred_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "")
                cred = firebase_admin.credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)

            # 사용자의 FCM 토큰 조회
            token = self._get_fcm_token(user_id)
            if not token:
                return False

            msg = messaging.Message(
                notification=messaging.Notification(
                    title="인성이블로그",
                    body=message[:200],
                ),
                token=token,
            )
            messaging.send(msg)
            logger.info(f"FCM 전송 완료: user={user_id[:8]}")
            return True
        except ImportError:
            logger.debug("firebase-admin 미설치 — FCM 비활성")
            return False
        except Exception as e:
            logger.error(f"FCM 오류: {e}")
            return False

    # --- 카카오 나에게 보내기 ---

    async def _send_kakao_memo(self, message: str) -> bool:
        """카카오톡 나에게 보내기 (관리자 본인 전용)."""
        access_token = os.environ.get("KAKAO_ACCESS_TOKEN", "")
        if not access_token:
            return False

        url = "https://kapi.kakao.com/v2/api/talk/memo/default/send"
        headers = {"Authorization": f"Bearer {access_token}"}
        template = {
            "object_type": "text",
            "text": f"[인성이블로그]\n{message[:300]}",
            "link": {"web_url": "https://insungi.vercel.app"},
        }
        data = {"template_object": json.dumps(template)}

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, headers=headers, data=data)
                if resp.status_code == 200:
                    logger.info("카카오 나에게 보내기 전송 완료")
                    return True
                elif resp.status_code == 401:
                    logger.warning("카카오 토큰 만료 — 갱신 필요")
                    return False
                else:
                    logger.warning(f"카카오 실패: HTTP {resp.status_code}")
                    return False
        except Exception as e:
            logger.error(f"카카오 오류: {e}")
            return False

    # --- 헬퍼 ---

    def _get_chat_id(self, user_id: str) -> str | None:
        """user_id → telegram_chat_id 조회."""
        try:
            from src.storage.supabase_client import get_chat_id_for_user
            return get_chat_id_for_user(user_id)
        except Exception:
            return None

    def _get_fcm_token(self, user_id: str) -> str | None:
        """user_id → FCM 토큰 조회 (Supabase에서)."""
        try:
            from src.storage.supabase_client import get_supabase
            sb = get_supabase()
            result = (
                sb.table("user_push_tokens")
                .select("fcm_token")
                .eq("user_id", user_id)
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )
            if result.data:
                return result.data[0]["fcm_token"]
            return None
        except Exception:
            return None

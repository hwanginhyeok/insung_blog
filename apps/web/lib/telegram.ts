/**
 * 텔레그램 관리자 알림 유틸리티 (서버 사이드 전용)
 *
 * 환경변수:
 *   TELEGRAM_BOT_TOKEN — 텔레그램 봇 토큰
 *   TELEGRAM_ADMIN_CHAT_ID — 관리자 채팅 ID (우선)
 *   TELEGRAM_CHAT_ID — Python 쪽과 공유하는 기본값 (fallback)
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ADMIN_CHAT_ID =
  process.env.TELEGRAM_ADMIN_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID ?? "";

/**
 * 관리자에게 텔레그램 메시지 전송.
 * 토큰/채팅 ID가 설정되지 않았으면 조용히 스킵.
 */
export async function notifyAdmin(message: string): Promise<boolean> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.warn("텔레그램 설정 없음 — 알림 생략");
    return false;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });

    if (!res.ok) {
      console.error(`텔레그램 알림 실패: HTTP ${res.status}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("텔레그램 알림 전송 오류:", err);
    return false;
  }
}

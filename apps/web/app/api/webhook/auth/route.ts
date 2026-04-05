import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Supabase Auth Webhook — user.created 이벤트 수신
 *
 * POST /api/webhook/auth
 * 1. SUPABASE_WEBHOOK_SECRET으로 요청 검증
 * 2. 신규 유저 정보 추출
 * 3. 텔레그램으로 관리자에게 알림
 * 4. 임계점 체크 (10, 50, 100, 500, 1000명)
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET || "";

// 사용자 수 임계점 목록
const MILESTONES: Record<number, string> = {
  10: "📊 10명 돌파! 현행 인프라 OK",
  50: "⚠️ 50명 돌파! 프록시+API 전환 준비 시작",
  100: "🚨 100명 돌파! 워커 다중화+서버 스펙업 필수",
  500: "🔥 500명 돌파! 분산 아키텍처 전환 시급",
  1000: "🏆 1000명 돌파!",
};

/**
 * 텔레그램 메시지 전송 (서버 사이드 fetch)
 */
async function sendTelegram(message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.warn("[webhook/auth] 텔레그램 설정 없음 — 알림 생략");
    return false;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT_ID,
          text: message,
          parse_mode: "Markdown",
        }),
      }
    );

    if (!res.ok) {
      console.error(`[webhook/auth] 텔레그램 전송 실패: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[webhook/auth] 텔레그램 전송 오류:`, err);
    return false;
  }
}

/**
 * 총 사용자 수 조회 (users 테이블 count)
 */
async function getUserCount(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("users")
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error("[webhook/auth] 사용자 수 조회 실패:", error.message);
      return -1;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[webhook/auth] 사용자 수 조회 오류:", err);
    return -1;
  }
}

export async function POST(req: NextRequest) {
  // 1. Webhook secret 검증
  if (!WEBHOOK_SECRET) {
    console.error("[webhook/auth] SUPABASE_WEBHOOK_SECRET 미설정");
    return NextResponse.json(
      { error: "서버 설정 오류" },
      { status: 500 }
    );
  }

  // Authorization 헤더 또는 x-webhook-secret 헤더로 검증
  const authHeader = req.headers.get("authorization");
  const webhookHeader = req.headers.get("x-webhook-secret");
  const token = authHeader?.replace("Bearer ", "") || webhookHeader;

  if (token !== WEBHOOK_SECRET) {
    console.warn("[webhook/auth] 잘못된 webhook secret");
    return NextResponse.json(
      { error: "인증 실패" },
      { status: 401 }
    );
  }

  // 2. 요청 바디 파싱
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청 바디" },
      { status: 400 }
    );
  }

  // Supabase Auth webhook 페이로드 구조:
  // { type: "INSERT", table: "users", record: { id, email, ... }, ... }
  // 또는 Auth hook 형태: { event: "user.created", user: { id, email, ... } }
  const eventType = (body.type as string) || (body.event as string);
  const record =
    (body.record as Record<string, unknown>) ||
    (body.user as Record<string, unknown>);

  // user.created (또는 INSERT) 이벤트만 처리
  if (
    eventType !== "INSERT" &&
    eventType !== "user.created" &&
    eventType !== "signup"
  ) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // 3. 신규 유저 정보 추출
  const email = (record?.email as string) || "unknown";
  const userId = (record?.id as string) || "unknown";

  console.log(`[webhook/auth] 신규 가입 감지: ${email} (${userId})`);

  // 4. 총 사용자 수 조회
  const totalCount = await getUserCount();
  const countStr = totalCount >= 0 ? `${totalCount}` : "?";

  // 5. 기본 알림 전송
  await sendTelegram(
    `🎉 *신규 가입!*\n${email}\n(총 ${countStr}명)`
  );

  // 6. 임계점 체크
  if (totalCount > 0) {
    const milestoneMsg = MILESTONES[totalCount];
    if (milestoneMsg) {
      await sendTelegram(`\n${milestoneMsg}\n\n현재 총 사용자: ${totalCount}명`);
    }
  }

  return NextResponse.json({ ok: true, total_users: totalCount });
}

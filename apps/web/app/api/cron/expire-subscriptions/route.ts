import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/cron/expire-subscriptions
 *
 * Vercel Cron: 매일 00:00 UTC (09:00 KST).
 * 해지된 구독 중 만료일이 지난 사용자의 tier를 free로 전환.
 */
export async function GET(req: NextRequest) {
  // 1. CRON_SECRET 검증 (Vercel이 자동 전송)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();

    // 2. 만료된 구독 조회 + 업데이트
    const { data: expiredUsers, error: selectError } = await admin
      .from("users")
      .select("id, tier, subscription_ends_at")
      .eq("subscription_status", "cancelled")
      .not("subscription_ends_at", "is", null)
      .lte("subscription_ends_at", new Date().toISOString());

    if (selectError) {
      console.error("만료 구독 조회 실패:", selectError);
      return NextResponse.json(
        { error: "조회 실패" },
        { status: 500 }
      );
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      return NextResponse.json({ expired: 0 });
    }

    // 3. 일괄 업데이트
    const userIds = expiredUsers.map((u) => u.id);
    const { error: updateError } = await admin
      .from("users")
      .update({
        tier: "free",
        subscription_status: "none",
        subscription_ends_at: null,
        portone_billing_key: null,
        portone_schedule_id: null,
        next_payment_at: null,
      })
      .in("id", userIds);

    if (updateError) {
      console.error("만료 구독 업데이트 실패:", updateError);
      return NextResponse.json(
        { error: "업데이트 실패" },
        { status: 500 }
      );
    }

    console.log(`만료 구독 처리 완료: ${userIds.length}명`);
    return NextResponse.json({
      expired: userIds.length,
      userIds,
    });
  } catch (e) {
    console.error("Cron 실행 오류:", e);
    return NextResponse.json(
      { error: "서버 오류" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";
import { cancelPaymentSchedule } from "@/lib/portone";

/**
 * POST /api/billing/cancel
 *
 * 구독 해지. 포트원 스케줄 삭제 + subscription_ends_at 설정.
 * 해지 후에도 다음 결제일까지는 현재 tier 유지.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(req: NextRequest) {
  // 1. 인증
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 2. 현재 구독 상태 확인
  const admin = createAdminClient();
  const { data: userData } = await admin
    .from("users")
    .select("subscription_status, portone_schedule_id, next_payment_at")
    .eq("id", user.id)
    .single();

  if (!userData || userData.subscription_status !== "active") {
    return NextResponse.json(
      { error: "활성 구독이 없습니다" },
      { status: 400 }
    );
  }

  try {
    // 3. 포트원 스케줄 삭제
    if (userData.portone_schedule_id) {
      await cancelPaymentSchedule(userData.portone_schedule_id);
    }

    // 4. DB 업데이트: 다음 결제일까지 현재 tier 유지
    const { error: updateError } = await admin
      .from("users")
      .update({
        subscription_status: "cancelled",
        subscription_ends_at: userData.next_payment_at,
        portone_schedule_id: null,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("해지 DB 업데이트 실패:", updateError);
      return NextResponse.json(
        { error: "해지 처리 중 오류가 발생했습니다" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      subscriptionEndsAt: userData.next_payment_at,
    });
  } catch (e) {
    console.error("구독 해지 실패:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "해지 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

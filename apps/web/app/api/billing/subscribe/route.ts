import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";
import { TIER_LIMITS, type Tier } from "@/lib/tier";
import {
  createPaymentSchedule,
  payWithBillingKey,
  getNextPaymentDate,
  generatePaymentId,
} from "@/lib/portone";

/**
 * POST /api/billing/subscribe
 * Body: { billingKey: string, tier: "basic" | "pro" }
 *
 * 빌링키로 최초 결제 + 정기결제 스케줄 등록.
 * 성공 시 users.tier 업그레이드 + subscription 필드 설정.
 */
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

  // 2. 입력 검증
  const body = await req.json().catch(() => null);
  if (!body?.billingKey || !body?.tier) {
    return NextResponse.json(
      { error: "billingKey와 tier가 필요합니다" },
      { status: 400 }
    );
  }

  const tier = body.tier as Tier;
  if (tier !== "basic" && tier !== "pro") {
    return NextResponse.json(
      { error: "tier는 basic 또는 pro만 가능합니다" },
      { status: 400 }
    );
  }

  const tierInfo = TIER_LIMITS[tier];

  try {
    // 3. 최초 결제 실행
    const paymentId = generatePaymentId(user.id);
    await payWithBillingKey({
      paymentId,
      billingKey: body.billingKey,
      orderName: `인성이블로그 ${tierInfo.label} 플랜`,
      amount: tierInfo.price,
    });

    // 4. 다음 달 정기결제 스케줄 등록
    const nextPaymentDate = getNextPaymentDate();
    const schedulePaymentId = generatePaymentId(user.id);
    const scheduleResult = await createPaymentSchedule({
      billingKey: body.billingKey,
      scheduleId: `schedule_${user.id.slice(0, 8)}_${Date.now()}`,
      paymentId: schedulePaymentId,
      orderName: `인성이블로그 ${tierInfo.label} 플랜 (정기결제)`,
      amount: tierInfo.price,
      timeToPay: nextPaymentDate.toISOString(),
    });

    // 5. DB 업데이트
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error: updateError } = await admin
      .from("users")
      .update({
        tier,
        subscription_status: "active",
        portone_billing_key: body.billingKey,
        portone_schedule_id: scheduleResult.scheduleId,
        subscription_started_at: now,
        subscription_ends_at: null,
        next_payment_at: nextPaymentDate.toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("구독 DB 업데이트 실패:", updateError);
      return NextResponse.json(
        { error: "구독 등록 중 오류가 발생했습니다" },
        { status: 500 }
      );
    }

    // 6. 최초 결제 이력 기록
    await admin.from("payments").insert({
      user_id: user.id,
      portone_payment_id: paymentId,
      amount: tierInfo.price,
      tier,
      status: "paid",
      paid_at: now,
    });

    return NextResponse.json({
      success: true,
      tier,
      nextPaymentAt: nextPaymentDate.toISOString(),
    });
  } catch (e) {
    console.error("구독 등록 실패:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "결제 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

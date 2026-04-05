import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/billing/sync
 *
 * 결제 동기화. 웹훅이 실패했을 때 사용자가 직접 동기화.
 * users 테이블의 subscription_status를 기반으로 tier를 재확인.
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

  try {
    const admin = createAdminClient();

    // 2. 최근 결제 이력 확인
    const { data: latestPayment } = await admin
      .from("payments")
      .select("tier, status, paid_at")
      .eq("user_id", user.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!latestPayment) {
      return NextResponse.json({
        synced: true,
        message: "결제 이력이 없습니다",
      });
    }

    // 3. 현재 사용자 상태 확인
    const { data: userData } = await admin
      .from("users")
      .select("tier, subscription_status")
      .eq("id", user.id)
      .single();

    // 4. tier 불일치 시 동기화
    if (userData && userData.tier !== latestPayment.tier) {
      await admin
        .from("users")
        .update({
          tier: latestPayment.tier,
          subscription_status: "active",
        })
        .eq("id", user.id);

      return NextResponse.json({
        synced: true,
        updated: true,
        tier: latestPayment.tier,
        message: `${latestPayment.tier} 플랜으로 동기화 완료`,
      });
    }

    return NextResponse.json({
      synced: true,
      updated: false,
      tier: userData?.tier,
      message: "이미 최신 상태입니다",
    });
  } catch (e) {
    console.error("결제 동기화 실패:", e);
    return NextResponse.json(
      { error: "동기화 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

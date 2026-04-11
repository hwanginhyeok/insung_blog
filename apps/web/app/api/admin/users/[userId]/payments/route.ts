import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

async function verifyAdmin() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "admin" ? user.id : null;
}

/**
 * GET /api/admin/users/[userId]/payments
 * 특정 사용자의 결제 이력 + 구독 상태 (관리자 전용)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const adminId = await verifyAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { userId } = params;

  const [paymentsResult, userResult] = await Promise.all([
    admin
      .from("payments")
      .select("id, portone_payment_id, amount, tier, status, paid_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),

    admin
      .from("users")
      .select(
        "tier, subscription_status, subscription_started_at, subscription_ends_at, next_payment_at, portone_billing_key"
      )
      .eq("id", userId)
      .single(),
  ]);

  const payments = paymentsResult.data || [];
  const userRow = userResult.data;

  // 합계 (paid 상태만)
  const totalPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalRefunded = payments
    .filter((p) => p.status === "refunded")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  // 결제 횟수
  const counts = {
    paid: payments.filter((p) => p.status === "paid").length,
    failed: payments.filter((p) => p.status === "failed").length,
    cancelled: payments.filter((p) => p.status === "cancelled").length,
    refunded: payments.filter((p) => p.status === "refunded").length,
  };

  return NextResponse.json({
    subscription: userRow
      ? {
          tier: userRow.tier,
          status: userRow.subscription_status || "none",
          startedAt: userRow.subscription_started_at,
          endsAt: userRow.subscription_ends_at,
          nextPaymentAt: userRow.next_payment_at,
          hasBillingKey: !!userRow.portone_billing_key,
        }
      : null,
    summary: {
      totalPaid,
      totalRefunded,
      netPaid: totalPaid - totalRefunded,
      counts,
    },
    payments,
  });
}

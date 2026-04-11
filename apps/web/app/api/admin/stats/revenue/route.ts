import { NextResponse } from "next/server";
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

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKst(iso: string): Date {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS);
}

function kstMonthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/**
 * GET /api/admin/stats/revenue
 * 매출 통계 (관리자 전용)
 *
 * - thisMonth / lastMonth: 이번 달 / 지난 달 매출 합계 + 결제 건수
 * - monthly12: 최근 12개월 매출 트렌드
 * - bySubscription: 구독 상태별 활성 사용자 수
 */
export async function GET() {
  const adminId = await verifyAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  const admin = createAdminClient();

  // 12개월 윈도우
  const since12mo = new Date();
  since12mo.setMonth(since12mo.getMonth() - 12);

  const [paymentsResult, subscriptionsResult] = await Promise.all([
    admin
      .from("payments")
      .select("amount, status, paid_at, created_at, tier")
      .gte("created_at", since12mo.toISOString())
      .order("created_at", { ascending: false }),

    admin.from("users").select("subscription_status, tier"),
  ]);

  const payments = (paymentsResult.data || []).filter((p) => p.status === "paid");

  // 12개월 키 미리 생성 (KST)
  const nowKst = toKst(new Date().toISOString());
  const monthKeys: string[] = [];
  const cursor = new Date(nowKst);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 12; i++) {
    monthKeys.unshift(kstMonthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  // 월별 집계
  const monthlyMap: Record<string, { amount: number; count: number; basic: number; pro: number }> = {};
  for (const key of monthKeys) {
    monthlyMap[key] = { amount: 0, count: 0, basic: 0, pro: 0 };
  }

  for (const p of payments) {
    const ts = p.paid_at || p.created_at;
    if (!ts) continue;
    const monthKey = kstMonthKey(toKst(ts));
    const bucket = monthlyMap[monthKey];
    if (!bucket) continue;
    bucket.amount += p.amount || 0;
    bucket.count++;
    if (p.tier === "basic") bucket.basic++;
    else if (p.tier === "pro") bucket.pro++;
  }

  const monthly12 = monthKeys.map((month) => ({ month, ...monthlyMap[month] }));

  const thisMonthKey = kstMonthKey(nowKst);
  const firstOfThisMonth = new Date(nowKst);
  firstOfThisMonth.setUTCDate(1);
  firstOfThisMonth.setUTCHours(0, 0, 0, 0);
  const lastMonthDate = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
  const lastMonthKey = kstMonthKey(lastMonthDate);

  const thisMonth = monthlyMap[thisMonthKey] || { amount: 0, count: 0, basic: 0, pro: 0 };
  const lastMonth = monthlyMap[lastMonthKey] || { amount: 0, count: 0, basic: 0, pro: 0 };

  // 12개월 누적
  const total12 = monthly12.reduce(
    (acc, m) => ({
      amount: acc.amount + m.amount,
      count: acc.count + m.count,
    }),
    { amount: 0, count: 0 }
  );

  // 구독 상태별 / 등급별 분포
  const subRows = subscriptionsResult.data || [];
  const bySubscription: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  for (const u of subRows) {
    const s = u.subscription_status || "none";
    bySubscription[s] = (bySubscription[s] || 0) + 1;
    const t = u.tier || "free";
    byTier[t] = (byTier[t] || 0) + 1;
  }

  return NextResponse.json({
    thisMonth: { key: thisMonthKey, ...thisMonth },
    lastMonth: { key: lastMonthKey, ...lastMonth },
    monthly12,
    total12,
    bySubscription,
    byTier,
  });
}

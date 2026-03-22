import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
}

/**
 * GET /api/neighbor/stats
 * 이웃 통계 종합: 이웃 수(타입별), 최근 교류 수, 신청 이력 수
 */
export async function GET() {
  const supabase = getSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 병렬 조회
  const admin = createAdminClient();
  const [neighborsResult, requestsResult, interactionsResult] =
    await Promise.all([
      admin
        .from("neighbors")
        .select("neighbor_type")
        .eq("user_id", user.id),
      admin
        .from("neighbor_requests")
        .select("status")
        .eq("user_id", user.id),
      admin
        .from("neighbor_interactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

  // 이웃 타입별 집계
  const neighborsByType: Record<string, number> = {
    mutual: 0,
    one_way_following: 0,
    one_way_follower: 0,
  };
  for (const row of neighborsResult.data || []) {
    const t = row.neighbor_type;
    if (t && t in neighborsByType) {
      neighborsByType[t]++;
    }
  }

  // 신청 상태별 집계
  const requestsByStatus: Record<string, number> = {
    sent: 0,
    accepted: 0,
    rejected: 0,
    cancelled: 0,
  };
  for (const row of requestsResult.data || []) {
    const s = row.status;
    if (s && s in requestsByStatus) {
      requestsByStatus[s]++;
    }
  }

  return NextResponse.json({
    neighbors: {
      total: (neighborsResult.data || []).length,
      byType: neighborsByType,
    },
    requests: {
      total: (requestsResult.data || []).length,
      byStatus: requestsByStatus,
    },
    interactions: {
      total: interactionsResult.count || 0,
    },
  });
}

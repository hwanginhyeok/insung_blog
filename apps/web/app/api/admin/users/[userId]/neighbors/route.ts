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
 * GET /api/admin/users/[userId]/neighbors
 * 특정 사용자의 이웃 현황 (관리자 전용)
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

  const [neighborsResult, requestsResult] = await Promise.all([
    admin
      .from("neighbors")
      .select("id, blog_id, blog_name, neighbor_type, category, created_at")
      .eq("user_id", params.userId)
      .order("created_at", { ascending: false }),
    admin
      .from("neighbor_requests")
      .select("id, target_blog_id, target_blog_name, status, requested_at")
      .eq("user_id", params.userId)
      .order("requested_at", { ascending: false })
      .limit(20),
  ]);

  // 타입별 집계
  const typeCount: Record<string, number> = { mutual: 0, one_way_following: 0, one_way_follower: 0 };
  for (const n of neighborsResult.data || []) {
    if (n.neighbor_type in typeCount) {
      typeCount[n.neighbor_type]++;
    }
  }

  return NextResponse.json({
    neighbors: neighborsResult.data || [],
    requests: requestsResult.data || [],
    stats: {
      total: (neighborsResult.data || []).length,
      byType: typeCount,
    },
  });
}

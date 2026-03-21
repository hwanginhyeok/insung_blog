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

/**
 * GET /api/admin/stats
 * 시스템 전체 통계 (관리자 전용)
 */
export async function GET() {
  const adminId = await verifyAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  const admin = createAdminClient();

  // DB 레벨 집계 — 단일 필드만 조회하여 그룹별 카운트
  const countByField = async (table: string, field: string) => {
    const { data } = await admin.from(table).select(field);
    const dist: Record<string, number> = {};
    let total = 0;
    for (const row of (data || []) as unknown as Record<string, string>[]) {
      const val = row[field] || "unknown";
      dist[val] = (dist[val] || 0) + 1;
      total++;
    }
    return { total, dist };
  };

  const [usersTier, usersStatus, commentStatus, neighborType, runLogResult] =
    await Promise.all([
      countByField("users", "tier"),
      countByField("users", "status"),
      countByField("pending_comments", "status"),
      countByField("neighbors", "neighbor_type"),
      admin
        .from("bot_run_log")
        .select("bloggers_visited, comments_written, comments_failed")
        .gte(
          "run_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        ),
    ]);

  // 주간 실행 통계
  const runLogs = runLogResult.data || [];
  const weeklyStats = runLogs.reduce(
    (acc, r) => ({
      bloggers: acc.bloggers + (r.bloggers_visited || 0),
      comments: acc.comments + (r.comments_written || 0),
      failed: acc.failed + (r.comments_failed || 0),
      runs: acc.runs + 1,
    }),
    { bloggers: 0, comments: 0, failed: 0, runs: 0 }
  );

  return NextResponse.json({
    users: {
      total: usersTier.total,
      byTier: usersTier.dist,
      byStatus: usersStatus.dist,
    },
    comments: {
      total: commentStatus.total,
      byStatus: commentStatus.dist,
    },
    neighbors: {
      total: neighborType.total,
      byType: neighborType.dist,
    },
    weekly: weeklyStats,
  });
}

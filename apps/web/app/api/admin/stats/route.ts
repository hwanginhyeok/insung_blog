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

  // 유저별 봇 사용현황 요약
  const { data: allRunLogs } = await admin
    .from("bot_run_log")
    .select("user_id, run_at, comments_written, comments_failed, error_message")
    .gte("run_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).getTime();
  const userBotStats: Record<string, {
    runs: number;
    comments: number;
    failed: number;
    lastRunAt: string | null;
    botStatus: "active" | "inactive" | "error";
  }> = {};

  for (const r of (allRunLogs || [])) {
    const uid = r.user_id;
    if (!userBotStats[uid]) {
      userBotStats[uid] = { runs: 0, comments: 0, failed: 0, lastRunAt: null, botStatus: "inactive" };
    }
    const s = userBotStats[uid];
    s.runs++;
    s.comments += r.comments_written || 0;
    s.failed += r.comments_failed || 0;

    // 최근 실행 시각 갱신
    if (!s.lastRunAt || r.run_at > s.lastRunAt) {
      s.lastRunAt = r.run_at;
      const runTime = new Date(r.run_at).getTime();
      if (runTime > sevenDaysAgo) {
        s.botStatus = r.error_message ? "error" : "active";
      }
    }
  }

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
    userBotStats,
  });
}

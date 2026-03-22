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
 * GET /api/admin/users/[userId]/bot-stats
 * 특정 사용자의 댓글봇 사용현황 (관리자 전용)
 *
 * 반환: 실행횟수, 댓글 게시/실패, 마지막 실행, 상태 뱃지용 데이터
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

  // 병렬 조회
  const [runLogResult, commentResult, settingsResult] = await Promise.all([
    // 실행 이력 (최근 30일)
    admin
      .from("bot_run_log")
      .select("id, run_at, bloggers_visited, comments_written, comments_failed, duration_seconds, error_message")
      .eq("user_id", userId)
      .gte("run_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("run_at", { ascending: false }),

    // 댓글 상태별 카운트
    admin
      .from("pending_comments")
      .select("status")
      .eq("user_id", userId),

    // 봇 설정 (활성 여부)
    admin
      .from("bot_settings")
      .select("is_active, approval_mode")
      .eq("user_id", userId)
      .limit(1),
  ]);

  const runs = runLogResult.data || [];
  const comments = commentResult.data || [];
  const settings = settingsResult.data?.[0] || null;

  // 실행 통계 집계
  const totalRuns = runs.length;
  const totalBloggers = runs.reduce((sum, r) => sum + (r.bloggers_visited || 0), 0);
  const totalComments = runs.reduce((sum, r) => sum + (r.comments_written || 0), 0);
  const totalFailed = runs.reduce((sum, r) => sum + (r.comments_failed || 0), 0);
  const lastRun = runs[0] || null;
  const hasError = lastRun?.error_message != null;

  // 댓글 상태별 카운트
  const commentCounts: Record<string, number> = {};
  for (const c of comments) {
    const s = c.status || "unknown";
    commentCounts[s] = (commentCounts[s] || 0) + 1;
  }

  // 상태 판정: 활성 + 최근 7일 내 실행 → active, 에러 → error, 그 외 → inactive
  let botStatus: "active" | "inactive" | "error" = "inactive";
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  if (lastRun && new Date(lastRun.run_at).getTime() > sevenDaysAgo) {
    botStatus = hasError ? "error" : "active";
  }

  return NextResponse.json({
    summary: {
      totalRuns,
      totalBloggers,
      totalComments,
      totalFailed,
      botStatus,
      lastRunAt: lastRun?.run_at || null,
      isActive: settings?.is_active ?? false,
      approvalMode: settings?.approval_mode || "manual",
    },
    commentCounts,
    recentRuns: runs.slice(0, 10),
  });
}

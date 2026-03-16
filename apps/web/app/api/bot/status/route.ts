import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * GET /api/bot/status
 * 봇 상태 종합 조회: 최근 실행 이력 + 설정 + 대기 댓글 수
 */
export async function GET() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 병렬 조회: 최근 실행 이력 + 설정 + 대기 댓글 수 (user_id 필터)
  const [runsResult, settingsResult, pendingResult] = await Promise.all([
    supabase
      .from("bot_run_log")
      .select("*")
      .eq("user_id", user.id)
      .order("run_at", { ascending: false })
      .limit(10),
    supabase.from("bot_settings").select("*").eq("user_id", user.id).single(),
    supabase
      .from("pending_comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending"),
  ]);

  // 오늘 통계 (최근 실행 중 오늘 것만)
  const today = new Date().toISOString().split("T")[0];
  const todayRuns = (runsResult.data || []).filter((r) =>
    r.run_at?.startsWith(today)
  );
  const todayStats = todayRuns.reduce(
    (acc, r) => ({
      bloggers: acc.bloggers + (r.bloggers_visited || 0),
      comments: acc.comments + (r.comments_written || 0),
      failed: acc.failed + (r.comments_failed || 0),
    }),
    { bloggers: 0, comments: 0, failed: 0 }
  );

  return NextResponse.json({
    recentRuns: runsResult.data || [],
    settings: settingsResult.data || null,
    pendingCount: pendingResult.count || 0,
    todayStats,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
}

/**
 * GET /api/bot/stats
 * 댓글 통계 조회 (일별/주별 집계)
 *
 * Query params:
 *   period: "daily" | "weekly" (default: "daily")
 *   days: 숫자 (default: 7, max: 30) — 최근 N일치 데이터
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const period = req.nextUrl.searchParams.get("period") || "daily";
  const days = Math.min(Number(req.nextUrl.searchParams.get("days")) || 7, 30);

  // 조회 시작일 계산
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  // bot_run_log에서 기간 내 데이터 조회
  const { data: runs, error } = await supabase
    .from("bot_run_log")
    .select(
      "id, run_at, bloggers_visited, comments_written, comments_failed, pending_count, duration_seconds"
    )
    .eq("user_id", user.id)
    .gte("run_at", sinceIso)
    .order("run_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const runsData = runs || [];

  if (period === "weekly") {
    // 주별 집계: ISO 주차(YYYY-WW) 기준
    const weeklyMap = new Map<
      string,
      { bloggers: number; comments: number; failed: number; runs: number }
    >();

    for (const r of runsData) {
      const date = new Date(r.run_at);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // 일요일 기준
      const weekKey = weekStart.toISOString().split("T")[0];

      const existing = weeklyMap.get(weekKey) || {
        bloggers: 0,
        comments: 0,
        failed: 0,
        runs: 0,
      };
      weeklyMap.set(weekKey, {
        bloggers: existing.bloggers + (r.bloggers_visited || 0),
        comments: existing.comments + (r.comments_written || 0),
        failed: existing.failed + (r.comments_failed || 0),
        runs: existing.runs + 1,
      });
    }

    const weekly = Array.from(weeklyMap.entries()).map(([weekStart, stats]) => ({
      weekStart,
      ...stats,
    }));

    return NextResponse.json({ period: "weekly", data: weekly });
  }

  // 일별 집계
  const dailyMap = new Map<
    string,
    { bloggers: number; comments: number; failed: number; runs: number }
  >();

  for (const r of runsData) {
    const dateKey = r.run_at.split("T")[0];
    const existing = dailyMap.get(dateKey) || {
      bloggers: 0,
      comments: 0,
      failed: 0,
      runs: 0,
    };
    dailyMap.set(dateKey, {
      bloggers: existing.bloggers + (r.bloggers_visited || 0),
      comments: existing.comments + (r.comments_written || 0),
      failed: existing.failed + (r.comments_failed || 0),
      runs: existing.runs + 1,
    });
  }

  const daily = Array.from(dailyMap.entries()).map(([date, stats]) => ({
    date,
    ...stats,
  }));

  // 전체 합계
  const totals = runsData.reduce(
    (acc, r) => ({
      bloggers: acc.bloggers + (r.bloggers_visited || 0),
      comments: acc.comments + (r.comments_written || 0),
      failed: acc.failed + (r.comments_failed || 0),
      runs: acc.runs + 1,
    }),
    { bloggers: 0, comments: 0, failed: 0, runs: 0 }
  );

  return NextResponse.json({
    period: "daily",
    days,
    data: daily,
    totals,
  });
}

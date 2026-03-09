import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { extractBlogIdAndLogNo, extractPostMetrics } from "@/lib/crawl/naver-blog";

export const maxDuration = 60; // 여러 게시물 크롤링

/**
 * GET /api/analytics
 * 사용자의 게시물 성과 데이터 반환
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

  // 최신 스냅샷 (URL별 최신 1건)
  const { data: latestStats } = await supabase
    .from("post_analytics")
    .select("id, post_url, post_title, view_count, comment_count, like_count, crawled_at")
    .eq("user_id", user.id)
    .order("crawled_at", { ascending: false });

  // URL별 최신 스냅샷만 추출 (뷰 대신 앱 레벨에서 처리)
  const seen = new Set<string>();
  const stats = (latestStats || []).filter((s) => {
    if (seen.has(s.post_url)) return false;
    seen.add(s.post_url);
    return true;
  });

  // 시계열 데이터 (최근 30일)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: timeline } = await supabase
    .from("post_analytics")
    .select("post_url, view_count, crawled_at")
    .eq("user_id", user.id)
    .gte("crawled_at", thirtyDaysAgo.toISOString())
    .order("crawled_at");

  // 총합 계산
  const totalViews = stats.reduce((sum, s) => sum + (s.view_count || 0), 0);
  const avgViews = stats.length > 0 ? Math.round(totalViews / stats.length) : 0;
  const topPost = stats.length > 0
    ? stats.reduce((top, s) => (s.view_count > top.view_count ? s : top), stats[0])
    : null;

  return NextResponse.json({
    stats,
    timeline: timeline || [],
    summary: {
      totalViews,
      avgViews,
      totalPosts: stats.length,
      topPost,
    },
  });
}

/**
 * POST /api/analytics
 * Body: { urls: string[] }
 * 게시물 URL 목록으로 크롤링 트리거 → 조회수 수집 → DB 저장
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const { urls } = body as { urls: string[] };

  if (!urls?.length) {
    return NextResponse.json(
      { error: "크롤링할 URL이 필요합니다" },
      { status: 400 }
    );
  }

  const results: { url: string; success: boolean; metrics?: unknown; error?: string }[] = [];

  for (const url of urls.slice(0, 20)) { // 최대 20개
    try {
      const parsed = extractBlogIdAndLogNo(url);
      if (!parsed) {
        results.push({ url, success: false, error: "유효하지 않은 URL" });
        continue;
      }

      const metrics = await extractPostMetrics(parsed.blogId, parsed.logNo);

      // DB 저장
      await supabase.from("post_analytics").insert({
        user_id: user.id,
        post_url: url,
        post_title: metrics.title || null,
        view_count: metrics.viewCount,
        comment_count: metrics.commentCount,
        like_count: metrics.likeCount,
      });

      results.push({ url, success: true, metrics });

      // 딜레이 (봇 감지 회피)
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      const message = e instanceof Error ? e.message : "크롤링 실패";
      results.push({ url, success: false, error: message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  return NextResponse.json({
    results,
    message: `${successCount}/${results.length}개 크롤링 완료`,
  });
}

import { NextRequest, NextResponse } from "next/server";
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
 * GET /api/bot/candidates
 * 본인 검토 대기(pending) 후보 조회 + neighbor_blog_profile 조인.
 *
 * 응답:
 * {
 *   pending: [{ id, blog_id, blog_name, relevance, score, reasoning, source_keywords, main_topics, post_count_30d, generated_at }]
 *   counts: { pending, approved, rejected }
 *   profile: { categories: [], keywords: [], analyzed_at }
 * }
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

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);
  const admin = createAdminClient();

  // 본인 후보
  const { data: candidates } = await admin
    .from("neighbor_candidates")
    .select("id, blog_id, status, relevance, relevance_score, source_keywords, reasoning, generated_at, reviewed_at")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(limit);

  const pending = (candidates || []).filter((c) => c.status === "pending");

  // 카운트
  const counts = {
    pending: pending.length,
    approved: (candidates || []).filter((c) => c.status === "approved").length,
    rejected: (candidates || []).filter((c) => c.status === "rejected").length,
  };

  // pending blog_id들로 글로벌 캐시(neighbor_blog_profile) 조회
  const blogIds = pending.map((c) => c.blog_id);
  let profilesMap: Record<string, { blog_name: string | null; main_topics: string[]; post_count_30d: number; quality_flag: string }> = {};

  if (blogIds.length > 0) {
    const { data: profiles } = await admin
      .from("neighbor_blog_profile")
      .select("blog_id, blog_name, main_topics, post_count_30d, quality_flag")
      .in("blog_id", blogIds);

    profilesMap = (profiles || []).reduce((acc, p) => {
      acc[p.blog_id] = {
        blog_name: p.blog_name,
        main_topics: p.main_topics || [],
        post_count_30d: p.post_count_30d || 0,
        quality_flag: p.quality_flag,
      };
      return acc;
    }, {} as typeof profilesMap);
  }

  // pending 행에 profile 머지
  const pendingEnriched = pending.map((c) => ({
    id: c.id,
    blog_id: c.blog_id,
    blog_name: profilesMap[c.blog_id]?.blog_name || c.blog_id,
    main_topics: profilesMap[c.blog_id]?.main_topics || [],
    post_count_30d: profilesMap[c.blog_id]?.post_count_30d || 0,
    quality_flag: profilesMap[c.blog_id]?.quality_flag || "ok",
    relevance: c.relevance,
    relevance_score: c.relevance_score || 0,
    source_keywords: c.source_keywords || [],
    reasoning: c.reasoning || "",
    generated_at: c.generated_at,
  }));

  // 사용자 블로그 분야 정보
  const { data: settings } = await admin
    .from("bot_settings")
    .select("discovered_categories, discovered_keywords, categories_analyzed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    pending: pendingEnriched,
    counts,
    profile: settings
      ? {
          categories: settings.discovered_categories || [],
          keywords: settings.discovered_keywords || [],
          analyzed_at: settings.categories_analyzed_at,
        }
      : null,
  });
}

/**
 * POST /api/bot/candidates/decide
 * (이 라우트에선 미사용. /decide 서브라우트에서 처리)
 */

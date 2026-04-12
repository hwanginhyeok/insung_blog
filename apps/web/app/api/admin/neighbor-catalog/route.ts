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

const VALID_FLAGS = ["ok", "ad", "ai", "commercial", "review_farm", "inactive", "low_quality"] as const;

/**
 * GET /api/admin/neighbor-catalog
 * 글로벌 블로그 카탈로그 (관리자 전용)
 *
 * Query:
 *   - flag: 특정 quality_flag 필터
 *   - q: blog_id/blog_name 검색
 *   - limit (default 50, max 200)
 *
 * 응답:
 *   - rows: 블로그 프로파일 목록
 *   - counts: { total, by_flag: {ok: N, ad: N, ...} }
 *   - topics: 분야별 분포 (top 20)
 */
export async function GET(req: NextRequest) {
  const adminId = await verifyAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  const admin = createAdminClient();

  const flag = req.nextUrl.searchParams.get("flag");
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);

  // 1. 필터된 행 조회
  let rowsQuery = admin
    .from("neighbor_blog_profile")
    .select("blog_id, blog_name, quality_flag, ad_score, ai_score, main_topics, post_count_30d, reasoning, analyzed_at, analyzer, permanently_blocked, manually_corrected, corrected_at")
    .order("analyzed_at", { ascending: false });

  if (flag && (VALID_FLAGS as readonly string[]).includes(flag)) {
    rowsQuery = rowsQuery.eq("quality_flag", flag);
  }

  if (q) {
    rowsQuery = rowsQuery.or(`blog_id.ilike.%${q}%,blog_name.ilike.%${q}%`);
  }

  rowsQuery = rowsQuery.limit(limit);
  const { data: rows } = await rowsQuery;

  // 2. 전체 카운트 + flag별 분포 (별도 쿼리)
  const { data: allFlags } = await admin
    .from("neighbor_blog_profile")
    .select("quality_flag");

  const byFlag: Record<string, number> = {};
  for (const f of VALID_FLAGS) byFlag[f] = 0;
  for (const row of allFlags || []) {
    const f = row.quality_flag;
    if (f && f in byFlag) byFlag[f]++;
  }
  const total = (allFlags || []).length;

  // 3. 분야 분포 (main_topics 펼쳐서 top 20)
  const { data: allTopics } = await admin
    .from("neighbor_blog_profile")
    .select("main_topics")
    .not("main_topics", "is", null);

  const topicCounts: Record<string, number> = {};
  for (const row of allTopics || []) {
    for (const t of (row.main_topics || []) as string[]) {
      if (t) topicCounts[t] = (topicCounts[t] || 0) + 1;
    }
  }
  const topTopics = Object.entries(topicCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([topic, count]) => ({ topic, count }));

  return NextResponse.json({
    rows: rows || [],
    counts: { total, byFlag },
    topTopics,
  });
}

/**
 * POST /api/admin/neighbor-catalog
 * 수동 분류 변경 (관리자 수정)
 *
 * Body: { blog_id: string, quality_flag: string, reasoning?: string }
 */
export async function POST(req: NextRequest) {
  const adminId = await verifyAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  const body = await req.json();
  const { blog_id, quality_flag, reasoning } = body as {
    blog_id: string;
    quality_flag: string;
    reasoning?: string;
  };

  if (!blog_id || !quality_flag) {
    return NextResponse.json({ error: "blog_id, quality_flag 필요" }, { status: 400 });
  }
  if (!(VALID_FLAGS as readonly string[]).includes(quality_flag)) {
    return NextResponse.json({ error: `허용 flag: ${VALID_FLAGS.join(", ")}` }, { status: 400 });
  }

  const admin = createAdminClient();
  const permBlocked = ["ad", "ai", "commercial", "low_quality"].includes(quality_flag);

  const update: Record<string, unknown> = {
    quality_flag,
    permanently_blocked: permBlocked,
    manually_corrected: true,
    corrected_by: adminId,
    corrected_at: new Date().toISOString(),
  };
  if (reasoning) update.reasoning = reasoning;

  const { error } = await admin
    .from("neighbor_blog_profile")
    .update(update)
    .eq("blog_id", blog_id);

  if (error) {
    console.error("카탈로그 수정 실패:", error);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }

  return NextResponse.json({ success: true, blog_id, quality_flag, permanently_blocked: permBlocked });
}

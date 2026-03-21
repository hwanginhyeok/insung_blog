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

const VALID_STATUSES = [
  "pending",
  "approved",
  "posted",
  "rejected",
  "failed",
  "all",
] as const;

/**
 * GET /api/bot/comments
 * 댓글 이력 조회 (페이지네이션 + 필터)
 *
 * Query params:
 *   status: "all" | "pending" | "approved" | "posted" | "rejected" | "failed" (default: "all")
 *   page:   페이지 번호 (default: 1, 1-based)
 *   limit:  페이지당 항목 수 (default: 20, max: 100)
 *   order:  "asc" | "desc" (default: "desc")
 *   blog_id: 특정 블로그 ID 필터 (optional)
 *   ai_only: "true" — AI 생성 댓글만 (optional)
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

  const params = req.nextUrl.searchParams;

  const status = params.get("status") || "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(Number(params.get("limit")) || 20, 100);
  const order = params.get("order") === "asc" ? "asc" : "desc";
  const blogId = params.get("blog_id") || null;
  const aiOnly = params.get("ai_only") === "true";

  // status 유효성 검사
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json(
      {
        error: `status는 ${VALID_STATUSES.join(", ")} 중 하나여야 합니다`,
      },
      { status: 400 }
    );
  }

  const offset = (page - 1) * limit;

  // 기본 쿼리
  let query = supabase
    .from("pending_comments")
    .select(
      "id, blog_id, post_url, post_title, comment_text, ai_generated, status, created_at, decided_by, decided_at",
      { count: "exact" }
    )
    .eq("user_id", user.id);

  // 상태 필터
  if (status === "all") {
    query = query.in("status", ["approved", "posted", "rejected", "failed"]);
  } else {
    query = query.eq("status", status);
  }

  // 블로그 ID 필터
  if (blogId) {
    query = query.eq("blog_id", blogId);
  }

  // AI 생성 필터
  if (aiOnly) {
    query = query.eq("ai_generated", true);
  }

  // 정렬 + 페이지네이션
  query = query
    .order("created_at", { ascending: order === "asc" })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  return NextResponse.json({
    comments: data || [],
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
}

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
 * GET /api/neighbor/interactions
 * 교류 기록 조회. ?blog_id=xxx&type=comment_sent|comment_received|visit
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

  const blogId = req.nextUrl.searchParams.get("blog_id");
  const interactionType = req.nextUrl.searchParams.get("type");
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit")) || 50,
    200
  );

  const admin = createAdminClient();
  let query = admin
    .from("neighbor_interactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (blogId) {
    query = query.eq("blog_id", blogId);
  }
  if (interactionType) {
    query = query.eq("interaction_type", interactionType);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ interactions: data });
}

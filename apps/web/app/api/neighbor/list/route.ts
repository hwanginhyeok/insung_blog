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
 * GET /api/neighbor/list
 * 이웃 목록 조회. ?type=mutual|one_way_following|one_way_follower
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

  const neighborType = req.nextUrl.searchParams.get("type");
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit")) || 100,
    500
  );

  const VALID_TYPES = ["mutual", "one_way_following", "one_way_follower"];
  if (neighborType && !VALID_TYPES.includes(neighborType)) {
    return NextResponse.json(
      { error: `type은 ${VALID_TYPES.join(", ")} 중 하나여야 합니다` },
      { status: 400 }
    );
  }

  let query = supabase
    .from("neighbors")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (neighborType) {
    query = query.eq("neighbor_type", neighborType);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ neighbors: data });
}

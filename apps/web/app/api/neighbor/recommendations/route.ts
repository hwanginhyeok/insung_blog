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
 * GET /api/neighbor/recommendations
 * 이웃 추천 목록. ?status=pending|applied|dismissed
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

  const status = req.nextUrl.searchParams.get("status") || "pending";
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit")) || 20,
    100
  );

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("neighbor_recommendations")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", status)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recommendations: data });
}

/**
 * PATCH /api/neighbor/recommendations
 * 추천 상태 변경. Body: { id: string, status: 'applied' | 'dismissed' }
 */
export async function PATCH(req: NextRequest) {
  const supabase = getSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const { id, status } = body as { id?: string; status?: string };

  if (!id || !status || !["applied", "dismissed"].includes(status)) {
    return NextResponse.json(
      { error: "id와 status(applied|dismissed)가 필요합니다" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("neighbor_recommendations")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

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
 * GET /api/neighbor/requests
 * 서로이웃 신청 이력 조회. ?status=sent|accepted|rejected|cancelled
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

  const status = req.nextUrl.searchParams.get("status");
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit")) || 50,
    200
  );

  let query = supabase
    .from("neighbor_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data });
}

/**
 * POST /api/neighbor/requests
 * 서로이웃 신청 (bot_commands에 neighbor_request 명령 등록)
 * Body: { targetBlogId: string, targetBlogName?: string, message?: string }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const { targetBlogId, targetBlogName, message } = body as {
    targetBlogId?: string;
    targetBlogName?: string;
    message?: string;
  };

  if (!targetBlogId?.trim()) {
    return NextResponse.json(
      { error: "targetBlogId가 필요합니다" },
      { status: 400 }
    );
  }

  // 중복 방지: pending/running 상태 명령이 있으면 거부
  const { data: active } = await supabase
    .from("bot_commands")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["pending", "running"])
    .limit(1)
    .single();

  if (active) {
    return NextResponse.json(
      { error: "이미 진행 중인 명령이 있습니다" },
      { status: 409 }
    );
  }

  // bot_commands에 neighbor_request 명령 등록
  const { data, error } = await supabase
    .from("bot_commands")
    .insert({
      user_id: user.id,
      command: "neighbor_request",
      status: "pending",
      payload: {
        target_blog_id: targetBlogId.trim(),
        target_blog_name: targetBlogName || null,
        message: message || "",
      },
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "신청 명령 등록 실패" }, { status: 500 });
  }

  return NextResponse.json({ success: true, command: data });
}

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * GET /api/bot/pending?status=pending
 * 승인 대기 댓글 목록 조회 (admin 전용)
 *
 * POST /api/bot/pending
 * Body: { id: string, action: "approve" | "reject" }
 * 댓글 승인/거부 처리
 */

async function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
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
}

async function authenticate(supabase: ReturnType<typeof createServerClient>) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const user = await authenticate(supabase);
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status") || "pending";

  const { data, error } = await supabase
    .from("pending_comments")
    .select(
      "id, blog_id, post_url, post_title, comment_text, ai_generated, status, created_at, decided_by, decided_at"
    )
    .eq("user_id", user.id)
    .eq("status", status)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comments: data });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const user = await authenticate(supabase);
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const { id, action } = body as { id?: string; action?: string };

  if (!id || !action) {
    return NextResponse.json(
      { error: "id와 action이 필요합니다" },
      { status: 400 }
    );
  }

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "action은 approve 또는 reject만 가능합니다" },
      { status: 400 }
    );
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  const { data, error } = await supabase
    .from("pending_comments")
    .update({
      status: newStatus,
      decided_by: "web",
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "해당 댓글을 찾을 수 없거나 이미 처리되었습니다" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, comment: data });
}

/**
 * PATCH /api/bot/pending
 * Body: { id: string, comment_text: string }
 * 대기 중인 댓글 텍스트 수정
 */
export async function PATCH(req: NextRequest) {
  const supabase = await getSupabase();
  const user = await authenticate(supabase);
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const { id, comment_text } = body as { id?: string; comment_text?: string };

  if (!id || !comment_text?.trim()) {
    return NextResponse.json(
      { error: "id와 comment_text가 필요합니다" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("pending_comments")
    .update({ comment_text: comment_text.trim() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id, comment_text")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "해당 댓글을 찾을 수 없거나 이미 처리되었습니다" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, comment: data });
}

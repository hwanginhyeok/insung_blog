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

async function getAuthUserId(): Promise<string | null> {
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

/**
 * GET /api/neighbor/themes
 * 블로그 테마 목록 조회
 */
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("bot_settings")
    .select("blog_themes")
    .eq("user_id", userId)
    .single();

  return NextResponse.json({ themes: data?.blog_themes || [] });
}

/**
 * POST /api/neighbor/themes
 * 블로그 테마 목록 저장
 * body: { themes: string[] }
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const themes: string[] = body.themes;

  if (!Array.isArray(themes)) {
    return NextResponse.json(
      { error: "themes는 문자열 배열이어야 합니다" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("bot_settings")
    .update({ blog_themes: themes })
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json(
      { error: "테마 저장 실패: " + error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, themes });
}

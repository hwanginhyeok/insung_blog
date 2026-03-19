import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/bot/settings
 * 봇 설정 변경 (upsert)
 * Body: { approval_mode?, is_active?, weekday_hours?, weekend_hours?,
 *         max_comments_per_day?, max_bloggers_per_day? }
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

  // 허용된 필드만 추출
  const allowedKeys = [
    "approval_mode",
    "is_active",
    "weekday_hours",
    "weekend_hours",
    "max_comments_per_day",
    "max_bloggers_per_day",
    "naver_blog_id",
    "comment_prompt",
  ] as const;

  const updateData: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in body) {
      updateData[key] = body[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "변경할 설정이 없습니다" },
      { status: 400 }
    );
  }

  // 유효성 검사
  if (
    updateData.approval_mode &&
    !["manual", "auto"].includes(updateData.approval_mode as string)
  ) {
    return NextResponse.json(
      { error: "approval_mode는 manual 또는 auto만 가능합니다" },
      { status: 400 }
    );
  }

  // upsert (없으면 생성, 있으면 수정)
  const { data, error } = await supabase
    .from("bot_settings")
    .upsert(
      {
        user_id: user.id,
        ...updateData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, settings: data });
}

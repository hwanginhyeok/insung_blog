import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/persona/default
 * Body: { personaId: string }
 *
 * 기본 페르소나 지정. 기존 기본 해제 → 새 기본 설정 (트랜잭션 대용 순서 보장)
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
  const { personaId } = body as { personaId: string };

  if (!personaId) {
    return NextResponse.json(
      { error: "personaId가 필요합니다" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 해당 페르소나가 사용자의 것인지 확인
  const { data: target } = await admin
    .from("user_personas")
    .select("id")
    .eq("id", personaId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json(
      { error: "페르소나를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 기존 기본 페르소나 해제
  await admin
    .from("user_personas")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("is_default", true);

  // 새 기본 페르소나 설정
  await admin
    .from("user_personas")
    .update({ is_default: true })
    .eq("id", personaId);

  return NextResponse.json({ success: true });
}

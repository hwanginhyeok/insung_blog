import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/onboarding — 온보딩 완료 상태 저장
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", user.id);

  if (error) {
    console.error("온보딩 상태 저장 실패:", error);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/onboarding — 온보딩 완료 여부 조회
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("onboarding_completed")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    completed: data?.onboarding_completed ?? false,
  });
}

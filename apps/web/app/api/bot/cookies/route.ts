import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";
import { encryptCookies, isEncrypted } from "@/lib/cookie-crypto";

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
}

/**
 * GET /api/bot/cookies
 * 쿠키 업로드 상태 조회
 */
export async function GET() {
  const supabase = getSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("bot_cookies")
    .select("uploaded_at, cookie_data")
    .eq("user_id", user.id)
    .single();

  if (!data) {
    return NextResponse.json({ hasCookies: false });
  }

  // 암호화된 쿠키든 평문이든 존재 여부만 확인
  const hasCookies = !!data.cookie_data;
  const encrypted = isEncrypted(data.cookie_data);
  const cookieCount = Array.isArray(data.cookie_data)
    ? data.cookie_data.length
    : encrypted
      ? -1  // 암호화됨, 개수 알 수 없음 (정상)
      : 0;

  return NextResponse.json({
    hasCookies,
    uploadedAt: data.uploaded_at,
    cookieCount,
    encrypted,
  });
}

/**
 * POST /api/bot/cookies
 * 쿠키 업로드 (upsert — 기존 있으면 덮어쓰기)
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
  const { cookieData } = body;

  if (!Array.isArray(cookieData) || cookieData.length === 0) {
    return NextResponse.json(
      { error: "유효한 쿠키 데이터가 없습니다" },
      { status: 400 }
    );
  }

  // 네이버 도메인 쿠키만 필터링
  const naverCookies = cookieData.filter((c: Record<string, unknown>) => {
    const domain = String(c.domain || "");
    return domain.includes("naver.com");
  });

  if (naverCookies.length === 0) {
    return NextResponse.json(
      { error: "네이버 쿠키가 포함되어 있지 않습니다" },
      { status: 400 }
    );
  }

  // 쿠키 암호화 후 저장
  let cookieDataToStore: string | typeof naverCookies = naverCookies;
  try {
    cookieDataToStore = encryptCookies(naverCookies);
  } catch (e) {
    console.warn("쿠키 암호화 실패 (COOKIE_ENCRYPTION_KEY 미설정?), 평문 저장:", e);
  }

  const admin = createAdminClient();
  const { error } = await admin.from("bot_cookies").upsert(
    {
      user_id: user.id,
      cookie_data: cookieDataToStore,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("쿠키 저장 실패:", error);
    return NextResponse.json({ error: "쿠키 저장 실패" }, { status: 500 });
  }

  // 쿠키 업로드 성공 → extract_blog_id 명령 자동 등록 (중복 방지)
  const { data: existingCmd } = await admin
    .from("bot_commands")
    .select("id")
    .eq("user_id", user.id)
    .eq("command", "extract_blog_id")
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();

  if (!existingCmd) {
    await admin.from("bot_commands").insert({
      user_id: user.id,
      command: "extract_blog_id",
      status: "pending",
    });
  }

  return NextResponse.json({
    success: true,
    cookieCount: naverCookies.length,
  });
}

/**
 * DELETE /api/bot/cookies
 * 쿠키 삭제
 */
export async function DELETE() {
  const supabase = getSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const admin = createAdminClient();
  await admin.from("bot_cookies").delete().eq("user_id", user.id);

  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * 관리자 권한 검증 헬퍼.
 * 요청자의 JWT → users 테이블 role === 'admin' 확인.
 */
async function verifyAdmin() {
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
    return { error: "인증이 필요합니다", status: 401 };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { error: "관리자 권한이 필요합니다", status: 403 };
  }

  return { userId: user.id };
}

/**
 * GET /api/admin/users
 * 전체 사용자 목록 조회 (관리자 전용).
 */
export async function GET() {
  const auth = await verifyAdmin();
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const admin = createAdminClient();
  const { data: users, error } = await admin
    .from("users")
    .select(
      "id, email, name, role, tier, status, monthly_gen_count, gen_count_reset_month, created_at"
    )
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "사용자 목록 조회 실패" },
      { status: 500 }
    );
  }

  return NextResponse.json({ users });
}

/**
 * PATCH /api/admin/users
 * 사용자 tier 또는 status 수정 (관리자 전용).
 * body: { userId: string, tier?: 'free'|'basic'|'pro', status?: 'active'|'suspended' }
 */
export async function PATCH(request: Request) {
  const auth = await verifyAdmin();
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const body = await request.json();
  const { userId, tier, status } = body as {
    userId?: string;
    tier?: string;
    status?: string;
  };

  if (!userId) {
    return NextResponse.json(
      { error: "userId가 필요합니다" },
      { status: 400 }
    );
  }

  // 유효값 검증
  const validTiers = ["free", "basic", "pro"];
  const validStatuses = ["active", "suspended"];

  if (tier && !validTiers.includes(tier)) {
    return NextResponse.json(
      { error: `유효하지 않은 티어: ${tier}` },
      { status: 400 }
    );
  }
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `유효하지 않은 상태: ${status}` },
      { status: 400 }
    );
  }

  const updates: Record<string, string> = {};
  if (tier) updates.tier = tier;
  if (status) updates.status = status;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "수정할 항목이 없습니다" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update(updates)
    .eq("id", userId);

  if (error) {
    return NextResponse.json(
      { error: "사용자 정보 수정 실패" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

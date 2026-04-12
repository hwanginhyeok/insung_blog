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

// 자동 모드 활성화 조건
const MIN_DECIDED = 30;
const MIN_APPROVAL_RATE = 0.9;

/**
 * GET /api/bot/auto-discover
 * 자동 모드 토글 활성화 가능 여부 + 현재 통계.
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

  // 결정 이력 (approved/rejected만) — 최근 100건
  const { data: decided } = await admin
    .from("neighbor_candidates")
    .select("status, reviewed_at")
    .eq("user_id", user.id)
    .in("status", ["approved", "rejected"])
    .order("reviewed_at", { ascending: false })
    .limit(100);

  const approved = (decided || []).filter((c) => c.status === "approved").length;
  const rejected = (decided || []).filter((c) => c.status === "rejected").length;
  const totalDecided = approved + rejected;
  const approvalRate = totalDecided > 0 ? approved / totalDecided : 0;

  const eligible = totalDecided >= MIN_DECIDED && approvalRate >= MIN_APPROVAL_RATE;

  // 현재 토글 상태
  const { data: settings } = await admin
    .from("bot_settings")
    .select("auto_discover_mode")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    autoDiscoverMode: settings?.auto_discover_mode ?? false,
    eligible,
    stats: {
      totalDecided,
      approved,
      rejected,
      approvalRate: Math.round(approvalRate * 100) / 100,
    },
    requirements: {
      minDecided: MIN_DECIDED,
      minApprovalRate: MIN_APPROVAL_RATE,
    },
  });
}

/**
 * POST /api/bot/auto-discover
 * 자동 모드 토글 변경.
 *
 * Body: { enabled: boolean }
 *
 * 활성화는 eligible=true일 때만 허용. 비활성화는 항상 가능.
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
  const enabled = !!body.enabled;

  const admin = createAdminClient();

  if (enabled) {
    // 활성화 시 자격 검증
    const { data: decided } = await admin
      .from("neighbor_candidates")
      .select("status")
      .eq("user_id", user.id)
      .in("status", ["approved", "rejected"]);

    const approved = (decided || []).filter((c) => c.status === "approved").length;
    const totalDecided = (decided || []).length;
    const approvalRate = totalDecided > 0 ? approved / totalDecided : 0;

    if (totalDecided < MIN_DECIDED || approvalRate < MIN_APPROVAL_RATE) {
      return NextResponse.json(
        {
          error: `자동 모드는 누적 ${MIN_DECIDED}건 + 승인률 ${MIN_APPROVAL_RATE * 100}% 이상이어야 활성화됩니다 (현재: ${totalDecided}건, ${Math.round(approvalRate * 100)}%)`,
        },
        { status: 403 }
      );
    }
  }

  const { error: updateError } = await admin
    .from("bot_settings")
    .update({ auto_discover_mode: enabled })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "설정 저장 실패" }, { status: 500 });
  }

  return NextResponse.json({ success: true, autoDiscoverMode: enabled });
}

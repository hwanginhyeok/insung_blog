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

interface DecideBody {
  candidate_ids: string[];
  decision: "approved" | "rejected";
}

/**
 * POST /api/bot/candidates/decide
 * 일괄 승인/거부.
 *
 * approved: candidate.status='approved' + neighbors 테이블에 type='discovered'로 INSERT
 * rejected: candidate.status='rejected' (사용자별 차단 — 같은 사용자에게 다시 추천 안 됨)
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

  let body: DecideBody;
  try {
    body = (await req.json()) as DecideBody;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  if (!Array.isArray(body.candidate_ids) || body.candidate_ids.length === 0) {
    return NextResponse.json({ error: "candidate_ids 필요" }, { status: 400 });
  }
  if (body.candidate_ids.length > 50) {
    return NextResponse.json({ error: "한 번에 최대 50개" }, { status: 400 });
  }
  if (!["approved", "rejected"].includes(body.decision)) {
    return NextResponse.json({ error: "decision은 approved/rejected" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 본인 후보만 조회 (다른 사용자 후보 조작 차단)
  const { data: candidates, error: fetchError } = await admin
    .from("neighbor_candidates")
    .select("id, blog_id, status")
    .eq("user_id", user.id)
    .in("id", body.candidate_ids)
    .eq("status", "pending");

  if (fetchError) {
    console.error("candidates 조회 실패:", fetchError);
    return NextResponse.json({ error: "후보 조회 실패" }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ error: "처리할 pending 후보 없음" }, { status: 404 });
  }

  const validIds = candidates.map((c) => c.id);
  const blogIds = candidates.map((c) => c.blog_id);

  // candidates 상태 업데이트
  const { error: updateError } = await admin
    .from("neighbor_candidates")
    .update({
      status: body.decision,
      reviewed_at: new Date().toISOString(),
    })
    .in("id", validIds);

  if (updateError) {
    console.error("candidates 업데이트 실패:", updateError);
    return NextResponse.json({ error: "결정 저장 실패" }, { status: 500 });
  }

  // 승인 시 neighbors 테이블에 INSERT
  let neighborsAdded = 0;
  if (body.decision === "approved") {
    const neighborRows = blogIds.map((blogId) => ({
      user_id: user.id,
      blog_id: blogId,
      blog_name: null, // discoverer가 추후 채움 (optional)
      neighbor_type: "discovered",
      category: "ai_filtered",
    }));

    // neighbors는 (user_id, blog_id) UNIQUE — upsert
    const { error: insertError, count } = await admin
      .from("neighbors")
      .upsert(neighborRows, { onConflict: "user_id,blog_id", count: "exact" });

    if (insertError) {
      console.error("neighbors INSERT 실패:", insertError);
      // candidates는 이미 업데이트됐으므로 부분 성공으로 응답
      return NextResponse.json({
        success: true,
        partial: true,
        candidates_updated: validIds.length,
        neighbors_added: 0,
        error: "이웃 추가 실패",
      });
    }
    neighborsAdded = count || validIds.length;
  }

  return NextResponse.json({
    success: true,
    decision: body.decision,
    candidates_updated: validIds.length,
    neighbors_added: neighborsAdded,
  });
}

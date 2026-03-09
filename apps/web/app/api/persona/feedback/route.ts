import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { DerivedRule } from "@/lib/ai/analyze-feedback";

/**
 * GET /api/persona/feedback
 * 사용자의 피드백 히스토리 + AI가 도출한 대기 중 규칙 반환
 *
 * 응답:
 *   { pendingRules: FeedbackWithRule[], recentFeedbacks: Feedback[] }
 */
export async function GET() {
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

  // 사용자 기본 페르소나 조회 (다중 페르소나 대응)
  const { data: persona } = await supabase
    .from("user_personas")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .maybeSingle();

  if (!persona) {
    return NextResponse.json({ pendingRules: [], recentFeedbacks: [] });
  }

  // 1. 대기 중 규칙 (AI가 도출했고 사용자 승인 대기)
  const { data: pendingRules } = await supabase
    .from("persona_feedback")
    .select("id, feedback_text, derived_rule, created_at")
    .eq("persona_id", persona.id)
    .eq("rule_status", "pending")
    .not("derived_rule", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  // 2. 최근 피드백 히스토리 (전체, 최근 20건)
  const { data: recentFeedbacks } = await supabase
    .from("persona_feedback")
    .select("id, feedback_text, rule_status, created_at")
    .eq("persona_id", persona.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    pendingRules: pendingRules || [],
    recentFeedbacks: recentFeedbacks || [],
  });
}

/**
 * POST /api/persona/feedback
 * Body: { feedbackId: string, action: "approve" | "reject" }
 *
 * approve → derived_rule 파싱 → persona_items INSERT (source: 'feedback')
 * reject  → rule_status = 'rejected'
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
  const { feedbackId, action, personaId: reqPersonaId } = body as {
    feedbackId: string;
    action: "approve" | "reject";
    personaId?: string;
  };

  if (!feedbackId || !["approve", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "feedbackId와 action(approve/reject)이 필요합니다" },
      { status: 400 }
    );
  }

  // 사용자 페르소나 조회 (personaId 지정 또는 기본 페르소나)
  let personaQuery = supabase
    .from("user_personas")
    .select("id")
    .eq("user_id", user.id);

  if (reqPersonaId) {
    personaQuery = personaQuery.eq("id", reqPersonaId);
  } else {
    personaQuery = personaQuery.eq("is_default", true);
  }

  const { data: persona } = await personaQuery.maybeSingle();

  if (!persona) {
    return NextResponse.json(
      { error: "페르소나가 없습니다" },
      { status: 404 }
    );
  }

  // 해당 피드백 조회 (소유권 확인 = persona_id 매칭)
  const { data: feedback } = await supabase
    .from("persona_feedback")
    .select("id, persona_id, derived_rule, rule_status")
    .eq("id", feedbackId)
    .eq("persona_id", persona.id)
    .single();

  if (!feedback) {
    return NextResponse.json(
      { error: "피드백을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  if (feedback.rule_status !== "pending") {
    return NextResponse.json(
      { error: "이미 처리된 피드백입니다" },
      { status: 409 }
    );
  }

  if (!feedback.derived_rule) {
    return NextResponse.json(
      { error: "도출된 규칙이 없는 피드백입니다" },
      { status: 400 }
    );
  }

  // ── 거절 ──
  if (action === "reject") {
    await supabase
      .from("persona_feedback")
      .update({ rule_status: "rejected" })
      .eq("id", feedbackId);

    return NextResponse.json({ success: true, action: "rejected" });
  }

  // ── 승인 → persona_items INSERT ──
  let rule: DerivedRule;
  try {
    rule = JSON.parse(feedback.derived_rule) as DerivedRule;
  } catch {
    return NextResponse.json(
      { error: "규칙 데이터 파싱 실패" },
      { status: 500 }
    );
  }

  const { error: insertError } = await supabase
    .from("persona_items")
    .insert({
      persona_id: persona.id,
      category: rule.category,
      key: rule.key,
      value: rule.value,
      priority: 5,
      source: "feedback" as const,
    });

  if (insertError) {
    console.error("피드백 규칙 → persona_items INSERT 실패:", insertError);
    return NextResponse.json(
      { error: "규칙 저장 실패" },
      { status: 500 }
    );
  }

  // 피드백 상태 업데이트
  await supabase
    .from("persona_feedback")
    .update({ rule_status: "approved" })
    .eq("id", feedbackId);

  return NextResponse.json({
    success: true,
    action: "approved",
    rule,
  });
}

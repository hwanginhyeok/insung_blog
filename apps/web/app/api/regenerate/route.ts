import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { regeneratePost } from "@/lib/ai/generate-post";
import { reserveUsage, rollbackUsage } from "@/lib/tier";
import { analyzeFeedbackPatterns } from "@/lib/ai/analyze-feedback";

export const maxDuration = 60;

const FEEDBACK_BATCH_SIZE = 5;

/**
 * POST /api/regenerate
 * Body: { previousTitle, previousBody, feedback, category }
 *
 * 이전 초안 + 피드백 → 수정된 초안 (Vision 단계 생략)
 * + 피드백을 persona_feedback에 저장, 5건마다 패턴 분석 트리거
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

  // 원자적 사용량 예약 (체크 + 증분 동시)
  const usage = await reserveUsage(user.id);
  if (!usage.allowed) {
    return NextResponse.json(
      {
        error: `이번 달 생성 한도(${usage.limit}회)를 초과했습니다`,
        usageExceeded: true,
        usage,
      },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { previousTitle, previousBody, feedback, category, personaId } = body as {
    previousTitle: string;
    previousBody: string;
    feedback: string;
    category: string;
    personaId?: string;
  };

  if (!previousBody?.trim()) {
    return NextResponse.json(
      { error: "기존 초안이 필요합니다" },
      { status: 400 }
    );
  }

  if (!feedback?.trim()) {
    return NextResponse.json(
      { error: "수정 요청을 입력해주세요" },
      { status: 400 }
    );
  }

  try {
    const result = await regeneratePost(
      previousTitle || "",
      previousBody,
      feedback,
      category || "일상",
      user.id,
      personaId
    );

    // 피드백 DB 저장 + 패턴 분석 (실패해도 재생성 결과에 영향 없음)
    saveFeedbackAndAnalyze(supabase, user.id, feedback).catch((e) =>
      console.error("피드백 저장/분석 오류 (무시):", e)
    );

    return NextResponse.json(result);
  } catch (e) {
    await rollbackUsage(user.id);
    const message = e instanceof Error ? e.message : "재생성 실패";
    console.error("재생성 오류:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 피드백 저장 + 5건 누적 시 AI 패턴 분석 트리거
 */
async function saveFeedbackAndAnalyze(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  feedbackText: string
) {
  // 1. 사용자 페르소나 조회
  const { data: persona } = await supabase
    .from("user_personas")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!persona) return; // 페르소나 없으면 저장 안 함

  // 2. 피드백 저장
  await supabase.from("persona_feedback").insert({
    persona_id: persona.id,
    feedback_text: feedbackText,
  });

  // 3. 미분석 피드백 수 확인
  const { data: unanalyzed } = await supabase
    .from("persona_feedback")
    .select("id, feedback_text")
    .eq("persona_id", persona.id)
    .is("derived_rule", null)
    .eq("rule_status", "pending")
    .order("created_at")
    .limit(FEEDBACK_BATCH_SIZE);

  if (!unanalyzed || unanalyzed.length < FEEDBACK_BATCH_SIZE) return;

  // 4. AI 패턴 분석
  const feedbackTexts = unanalyzed.map(
    (f: { id: string; feedback_text: string }) => f.feedback_text
  );
  const rules = await analyzeFeedbackPatterns(feedbackTexts);

  if (rules.length === 0) {
    // 패턴 없음 → 소비된 피드백 처리 (rejected = 분석 완료, 규칙 없음)
    const ids = unanalyzed.map(
      (f: { id: string; feedback_text: string }) => f.id
    );
    await supabase
      .from("persona_feedback")
      .update({ rule_status: "rejected" })
      .in("id", ids);
    return;
  }

  // 5. 도출된 규칙 저장 (각 규칙을 피드백 row에 매핑)
  for (let i = 0; i < rules.length && i < unanalyzed.length; i++) {
    const rule = rules[i];
    await supabase
      .from("persona_feedback")
      .update({
        derived_rule: JSON.stringify(rule),
      })
      .eq("id", unanalyzed[i].id);
  }

  // 나머지 피드백은 소비됨 (규칙 도출에 기여)
  const consumedIds = unanalyzed
    .slice(rules.length)
    .map((f: { id: string; feedback_text: string }) => f.id);
  if (consumedIds.length > 0) {
    await supabase
      .from("persona_feedback")
      .update({ rule_status: "rejected" })
      .in("id", consumedIds);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * POST /api/feedback — AI 글쓰기 후 피드백 저장
 *
 * Body: { generationId?: string, wouldUseAgain: boolean, feedbackText?: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const body = await req.json();
  const { generationId, wouldUseAgain, feedbackText } = body;

  if (typeof wouldUseAgain !== "boolean") {
    return NextResponse.json(
      { error: "wouldUseAgain은 필수입니다" },
      { status: 400 }
    );
  }

  // 텍스트 길이 제한 (XSS 방어 + 스토리지 보호)
  const sanitizedText = feedbackText
    ? String(feedbackText).slice(0, 500)
    : null;

  const { error } = await supabase.from("writing_feedback").insert({
    user_id: user.id,
    generation_id: generationId || null,
    would_use_again: wouldUseAgain,
    feedback_text: sanitizedText,
  });

  if (error) {
    console.error("피드백 저장 실패:", error);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

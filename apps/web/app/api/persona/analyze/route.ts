import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";
import { analyzePersona } from "@/lib/ai/analyze-persona";
import type { CrawledPost, CrawlResult } from "@/lib/crawl/naver-blog";

export const maxDuration = 60; // Sonnet 2-pass 분석 ~20-40초

/**
 * POST /api/persona/analyze
 * Body: { personaId: string, posts: CrawledPost[], fontSummary: FontSummary }
 *
 * 크롤링 결과 → 2-pass AI 분석 → persona_items INSERT → crawl_status='done'
 *
 * /api/persona/crawl 다음에 호출.
 * 분리한 이유: 크롤링(~20초) + AI 분석(~30초) 합치면 Vercel 60초 제한 초과 위험.
 */
export async function POST(req: NextRequest) {
  // 1. 인증 확인
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

  // 2. 요청 파싱
  const body = await req.json();
  const { personaId, posts, fontSummary } = body as {
    personaId: string;
    posts: CrawledPost[];
    fontSummary: CrawlResult["fontSummary"];
  };

  if (!personaId || !posts?.length) {
    return NextResponse.json(
      { error: "personaId와 posts가 필요합니다" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 3. 페르소나 소유권 확인
  const { data: persona } = await admin
    .from("user_personas")
    .select("id, user_id")
    .eq("id", personaId)
    .single();

  if (!persona || persona.user_id !== user.id) {
    return NextResponse.json(
      { error: "접근 권한이 없습니다" },
      { status: 403 }
    );
  }

  // 4. AI 분석 실행
  try {
    const items = await analyzePersona(posts, fontSummary);

    if (items.length === 0) {
      throw new Error("분석 결과가 없습니다. 게시물 내용을 확인해주세요.");
    }

    // 5. persona_items 일괄 INSERT
    const insertRows = items.map((item) => ({
      persona_id: personaId,
      category: item.category,
      key: item.key,
      value: item.value,
      priority: item.priority,
      source: "ai" as const,
    }));

    const { error: insertError } = await admin
      .from("persona_items")
      .insert(insertRows);

    if (insertError) {
      console.error("persona_items INSERT 실패:", insertError);
      throw new Error("분석 결과 저장 실패");
    }

    // 6. crawl_status → 'done'
    await admin
      .from("user_personas")
      .update({ crawl_status: "done" })
      .eq("id", personaId);

    return NextResponse.json({
      personaId,
      itemCount: items.length,
      items,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI 분석 실패";
    console.error("AI 분석 오류:", e);

    // 에러 상태 기록
    await admin
      .from("user_personas")
      .update({
        crawl_status: "error",
        crawl_error: message,
      })
      .eq("id", personaId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

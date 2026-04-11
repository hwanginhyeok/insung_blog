import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * GET /api/persona/preview/[id]
 * 페르소나의 미리보기 샘플 조회
 *
 * 응답 형식:
 *   {
 *     persona: { id, display_name, purpose, is_system },
 *     samples: {
 *       writing: [{ topic, content, sort_order }, ...],
 *       comment: [...],
 *       reply: [...]
 *     }
 *   }
 *
 * RLS:
 *   - 시스템 페르소나: 모든 인증 사용자 SELECT
 *   - 본인 페르소나: 본인만 SELECT
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
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
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 1. 페르소나 메타 조회 (RLS가 권한 검증)
  const { data: persona, error: pErr } = await supabase
    .from("user_personas")
    .select("id, display_name, purpose, is_system, category")
    .eq("id", params.id)
    .single();

  if (pErr || !persona) {
    return NextResponse.json({ error: "페르소나를 찾을 수 없습니다" }, { status: 404 });
  }

  // 2. 미리보기 샘플 조회 (RLS가 권한 검증)
  const { data: samples, error: sErr } = await supabase
    .from("persona_preview_samples")
    .select("sample_type, topic, content, sort_order, generated_by")
    .eq("persona_id", params.id)
    .order("sample_type")
    .order("sort_order");

  if (sErr) {
    return NextResponse.json({ error: "샘플 조회 실패" }, { status: 500 });
  }

  // 3. sample_type별 그룹핑
  const grouped: Record<string, Array<{ topic: string | null; content: string; sort_order: number; generated_by: string }>> = {
    writing: [],
    comment: [],
    reply: [],
  };

  for (const s of samples || []) {
    if (grouped[s.sample_type]) {
      grouped[s.sample_type].push({
        topic: s.topic,
        content: s.content,
        sort_order: s.sort_order,
        generated_by: s.generated_by,
      });
    }
  }

  return NextResponse.json({ persona, samples: grouped });
}

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/persona/examples/copy
 * 예시 페르소나를 사용자 계정에 복사
 * Body: { exampleId: string }
 */
export async function POST(req: NextRequest) {
  // 1. 인증
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 2. 요청 파싱
  const { exampleId } = await req.json();
  if (!exampleId) {
    return NextResponse.json({ error: "exampleId가 필요합니다" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. 예시 페르소나 조회
  const { data: example } = await admin
    .from("example_personas")
    .select("*")
    .eq("id", exampleId)
    .single();

  if (!example) {
    return NextResponse.json({ error: "예시 페르소나를 찾을 수 없습니다" }, { status: 404 });
  }

  // 4. 사용자 페르소나로 복사
  const { data: newPersona, error: insertError } = await admin
    .from("user_personas")
    .insert({
      user_id: user.id,
      display_name: `${example.display_name} (복사본)`,
      source_blog_url: null,
      crawl_status: "done",
      crawl_post_count: 0,
      is_default: false,
    })
    .select("id")
    .single();

  if (insertError || !newPersona) {
    return NextResponse.json({ error: "페르소나 생성 실패" }, { status: 500 });
  }

  // 5. 예시 항목 복사
  const { data: exampleItems } = await admin
    .from("example_persona_items")
    .select("category, key, value, priority")
    .eq("example_persona_id", exampleId);

  if (exampleItems?.length) {
    const rows = exampleItems.map((item) => ({
      persona_id: newPersona.id,
      category: item.category,
      key: item.key,
      value: item.value,
      priority: item.priority,
      source: "ai",
      is_active: true,
    }));
    await admin.from("persona_items").insert(rows);
  }

  return NextResponse.json({
    personaId: newPersona.id,
    itemCount: exampleItems?.length || 0,
    message: `"${example.display_name}" 예시를 복사했습니다`,
  });
}

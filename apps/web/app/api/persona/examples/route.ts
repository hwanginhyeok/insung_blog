import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/persona/examples
 * 예시 페르소나 목록 + 항목 반환 (인증 불필요, 모든 사용자 접근 가능)
 */
export async function GET() {
  const admin = createAdminClient();

  const { data: examples, error } = await admin
    .from("example_personas")
    .select("id, display_name, category, description, style_preview, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("category");

  if (error) {
    return NextResponse.json({ error: "예시 페르소나 조회 실패" }, { status: 500 });
  }

  // 각 예시의 항목도 함께 로드
  const exampleIds = examples.map((e) => e.id);
  const { data: items } = await admin
    .from("example_persona_items")
    .select("example_persona_id, category, key, value, priority")
    .in("example_persona_id", exampleIds);

  // 예시별로 항목 그룹핑
  const itemsByPersona: Record<string, typeof items> = {};
  for (const item of items || []) {
    const pid = item.example_persona_id;
    if (!itemsByPersona[pid]) itemsByPersona[pid] = [];
    itemsByPersona[pid].push(item);
  }

  const result = examples.map((e) => ({
    ...e,
    items: itemsByPersona[e.id] || [],
    itemCount: (itemsByPersona[e.id] || []).length,
  }));

  return NextResponse.json(result);
}

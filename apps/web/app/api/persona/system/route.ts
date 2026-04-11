import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/persona/system
 * 시스템 기본 페르소나 목록 (`is_system=true`)
 *
 * Query params:
 *   - purpose: writing | comment | reply (optional, 필터)
 *   - category: 맛집 | 카페 | 여행 | 일상 | 리뷰 (optional, writing 카테고리 필터)
 *
 * 인증 불필요. 모든 사용자(Free 포함)가 사용 가능.
 *
 * 응답: { personas: [{ id, display_name, purpose, category, items: [...] }] }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const purpose = url.searchParams.get("purpose"); // writing | comment | reply | null
  const category = url.searchParams.get("category"); // 맛집/카페/... | null

  const admin = createAdminClient();

  let query = admin
    .from("user_personas")
    .select("id, display_name, purpose, category, created_at")
    .eq("is_system", true)
    .order("purpose", { ascending: true })
    .order("category", { ascending: true });

  if (purpose && ["writing", "comment", "reply"].includes(purpose)) {
    query = query.eq("purpose", purpose);
  }
  if (category) {
    query = query.eq("category", category);
  }

  const { data: personas, error } = await query;

  if (error) {
    return NextResponse.json({ error: "시스템 페르소나 조회 실패" }, { status: 500 });
  }

  // 항목도 함께 로드
  const personaIds = (personas || []).map((p) => p.id);
  let itemsByPersona: Record<string, Array<{ category: string; key: string; value: string; priority: number }>> = {};

  if (personaIds.length > 0) {
    const { data: items } = await admin
      .from("persona_items")
      .select("persona_id, category, key, value, priority")
      .in("persona_id", personaIds)
      .eq("is_active", true);

    for (const item of items || []) {
      const pid = item.persona_id;
      if (!itemsByPersona[pid]) itemsByPersona[pid] = [];
      itemsByPersona[pid].push({
        category: item.category,
        key: item.key,
        value: item.value,
        priority: item.priority,
      });
    }
  }

  const result = (personas || []).map((p) => ({
    ...p,
    is_system: true,
    locked: false,
    items: itemsByPersona[p.id] || [],
    itemCount: (itemsByPersona[p.id] || []).length,
  }));

  return NextResponse.json({ personas: result });
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/persona/examples
 * 예시 페르소나 목록 + 항목 반환 (인증 불필요, 모든 사용자 접근 가능)
 *
 * Query params (Phase 2 lazy loading):
 *   - category: 맛집 | 카페 | 여행 | 일상 | 리뷰 (optional)
 *   - purpose:  writing | comment | reply       (optional, 기본 writing)
 *   - limit:    페이지 크기                       (optional, 기본 20, 최대 50)
 *   - offset:   페이지 오프셋                     (optional, 기본 0)
 *
 * 응답 형식 (배열 → 객체로 변경):
 *   { examples: [...], total: N, limit, offset }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const purpose = url.searchParams.get("purpose");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 50);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);

  const admin = createAdminClient();

  // 카운트용 쿼리 (필터만 적용, range 없음)
  let countQuery = admin
    .from("example_personas")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);
  if (category) countQuery = countQuery.eq("category", category);
  if (purpose && ["writing", "comment", "reply"].includes(purpose)) {
    countQuery = countQuery.eq("purpose", purpose);
  }
  const { count: total } = await countQuery;

  // 데이터 쿼리 (페이지네이션)
  let dataQuery = admin
    .from("example_personas")
    .select("id, display_name, category, purpose, description, style_preview, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("category")
    .range(offset, offset + limit - 1);

  if (category) dataQuery = dataQuery.eq("category", category);
  if (purpose && ["writing", "comment", "reply"].includes(purpose)) {
    dataQuery = dataQuery.eq("purpose", purpose);
  }

  const { data: examples, error } = await dataQuery;

  if (error) {
    return NextResponse.json({ error: "예시 페르소나 조회 실패" }, { status: 500 });
  }

  // 각 예시의 항목도 함께 로드
  const exampleIds = (examples || []).map((e) => e.id);
  let itemsByPersona: Record<string, Array<{ category: string; key: string; value: string; priority: number }>> = {};

  if (exampleIds.length > 0) {
    const { data: items } = await admin
      .from("example_persona_items")
      .select("example_persona_id, category, key, value, priority")
      .in("example_persona_id", exampleIds);

    for (const item of items || []) {
      const pid = item.example_persona_id;
      if (!itemsByPersona[pid]) itemsByPersona[pid] = [];
      itemsByPersona[pid].push({
        category: item.category,
        key: item.key,
        value: item.value,
        priority: item.priority,
      });
    }
  }

  const result = (examples || []).map((e) => ({
    ...e,
    items: itemsByPersona[e.id] || [],
    itemCount: (itemsByPersona[e.id] || []).length,
  }));

  return NextResponse.json({
    examples: result,
    total: total || 0,
    limit,
    offset,
  });
}

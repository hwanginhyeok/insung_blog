import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";
import { TIER_LIMITS, type Tier } from "@/lib/tier";

/**
 * POST /api/persona/activate
 * 용도별 활성 페르소나 지정 (bot_settings의 active_*_persona_id 슬롯 업데이트)
 *
 * Body: { purpose: 'writing' | 'comment' | 'reply', persona_id: string | null }
 *
 * 권한:
 *   - 모든 인증 사용자: 시스템 페르소나(is_system=true)는 활성화 가능
 *   - 본인 페르소나: 본인 소유 + locked=false인 경우만 활성화 가능
 *   - Pro 이외 (free/basic)는 3개 슬롯이 동기화됨 (purposeSplit=false) → 1개 변경 시 3개 모두 변경
 *   - Pro는 슬롯 독립 변경
 *
 * 응답: { success: true, settings: {...} }
 */
export async function POST(request: Request) {
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const { purpose, persona_id } = body;

  if (!["writing", "comment", "reply"].includes(purpose)) {
    return NextResponse.json(
      { error: "purpose는 writing/comment/reply 중 하나여야 합니다" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. 사용자 티어 조회 (purposeSplit 여부 결정)
  const { data: userRow } = await admin
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .single();

  const tier = ((userRow?.tier || "free") as Tier);
  const purposeSplit = TIER_LIMITS[tier].purposeSplit;

  // 2. persona_id 검증 (NULL 허용 = "활성 슬롯 비우기")
  if (persona_id) {
    const { data: persona, error: pErr } = await admin
      .from("user_personas")
      .select("id, user_id, is_system, locked, purpose")
      .eq("id", persona_id)
      .single();

    if (pErr || !persona) {
      return NextResponse.json({ error: "페르소나를 찾을 수 없습니다" }, { status: 404 });
    }

    // 시스템 페르소나가 아니면 본인 소유 + locked=false 검증
    if (!persona.is_system) {
      if (persona.user_id !== user.id) {
        return NextResponse.json({ error: "권한 없음" }, { status: 403 });
      }
      if (persona.locked) {
        return NextResponse.json(
          { error: "잠긴 페르소나는 활성화할 수 없습니다" },
          { status: 400 }
        );
      }
    }

    // 시스템 페르소나는 purpose 일치 검증 (writing 슬롯에 comment 페르소나 못 넣음)
    if (persona.is_system && persona.purpose !== purpose) {
      return NextResponse.json(
        { error: `이 페르소나는 ${persona.purpose} 용도입니다` },
        { status: 400 }
      );
    }

    // 사용자 페르소나도 purpose 일치 검증 (Phase 2 이후 모든 사용자 페르소나는 writing/comment/reply)
    if (!persona.is_system && persona.purpose !== purpose && purposeSplit) {
      return NextResponse.json(
        { error: `이 페르소나는 ${persona.purpose} 용도입니다` },
        { status: 400 }
      );
    }
  }

  // 3. bot_settings 업데이트 (purposeSplit 여부에 따라 1개 또는 3개 슬롯 동시 갱신)
  const updates: Record<string, string | null> = {};
  if (purposeSplit) {
    updates[`active_${purpose}_persona_id`] = persona_id || null;
  } else {
    // Free/Basic: 3개 슬롯이 항상 동일 페르소나를 가리키도록 강제
    // 단 본인 페르소나(is_system=false)인 경우, display_name 그룹의 동일 명칭 페르소나를
    // 각 purpose 슬롯에 배치해야 한다.
    if (persona_id) {
      const { data: target } = await admin
        .from("user_personas")
        .select("display_name, is_system")
        .eq("id", persona_id)
        .single();

      if (target?.is_system) {
        // 시스템 페르소나: 3개 슬롯 모두 동일 ID — 그러나 purpose가 단일이라 비현실적
        // 대신 동일 display_name 패밀리에서 각 purpose 시스템 페르소나를 자동 매칭
        // (예: '블로그 글쓰기 기본 - 맛집' 선택 시 댓글/답글은 시스템 기본으로)
        updates.active_writing_persona_id = persona_id;

        // comment/reply 슬롯은 시스템 기본 페르소나 자동 선택
        const { data: defaultComment } = await admin
          .from("user_personas")
          .select("id")
          .eq("is_system", true)
          .eq("purpose", "comment")
          .limit(1)
          .single();
        const { data: defaultReply } = await admin
          .from("user_personas")
          .select("id")
          .eq("is_system", true)
          .eq("purpose", "reply")
          .limit(1)
          .single();

        updates.active_comment_persona_id = defaultComment?.id || null;
        updates.active_reply_persona_id = defaultReply?.id || null;
      } else {
        // 본인 페르소나 (display_name 그룹): writing/comment/reply 3행 모두 매핑
        const { data: family } = await admin
          .from("user_personas")
          .select("id, purpose")
          .eq("user_id", user.id)
          .eq("display_name", target?.display_name || "")
          .eq("locked", false);

        const writingId = family?.find((p) => p.purpose === "writing")?.id || null;
        const commentId = family?.find((p) => p.purpose === "comment")?.id || null;
        const replyId = family?.find((p) => p.purpose === "reply")?.id || null;

        updates.active_writing_persona_id = writingId;
        updates.active_comment_persona_id = commentId;
        updates.active_reply_persona_id = replyId;
      }
    } else {
      updates.active_writing_persona_id = null;
      updates.active_comment_persona_id = null;
      updates.active_reply_persona_id = null;
    }
  }

  const { error: updateErr } = await admin
    .from("bot_settings")
    .update(updates)
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // 4. 갱신된 설정 반환
  const { data: settings } = await admin
    .from("bot_settings")
    .select("active_writing_persona_id, active_comment_persona_id, active_reply_persona_id")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({ success: true, settings, tier, purposeSplit });
}

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
    const { items, warnings } = await analyzePersona(posts, fontSummary);

    if (items.length === 0) {
      throw new Error("분석 결과가 없습니다. 게시물 내용을 확인해주세요.");
    }

    // 5. 콘텐츠 항목과 포맷팅 항목을 분리 저장 (한쪽 실패 시 다른 쪽 보존)
    const contentRows = items
      .filter((item) => item.category !== "formatting")
      .map((item) => ({
        persona_id: personaId,
        category: item.category,
        key: item.key,
        value: item.value,
        priority: item.priority,
        source: "ai" as const,
      }));

    const formattingRows = items
      .filter((item) => item.category === "formatting")
      .map((item) => ({
        persona_id: personaId,
        category: item.category,
        key: item.key,
        value: item.value,
        priority: item.priority,
        source: "ai" as const,
      }));

    if (contentRows.length > 0) {
      const { error: contentErr } = await admin
        .from("persona_items")
        .insert(contentRows);
      if (contentErr) {
        console.error("콘텐츠 항목 INSERT 실패:", contentErr);
        throw new Error("콘텐츠 분석 결과 저장 실패");
      }
    }

    if (formattingRows.length > 0) {
      const { error: fmtErr } = await admin
        .from("persona_items")
        .insert(formattingRows);
      if (fmtErr) {
        console.error("포맷팅 항목 INSERT 실패:", fmtErr);
        warnings.push("포맷팅 항목 저장 실패 — 페르소나 페이지에서 수동 추가해주세요");
      }
    }

    // 6. crawl_status → 'done'
    await admin
      .from("user_personas")
      .update({ crawl_status: "done" })
      .eq("id", personaId);

    // 7. (Phase 2) writing 페르소나 → comment/reply 자동 복제
    //    같은 사용자, 같은 display_name으로 comment/reply 행을 만들고 items 복사.
    //    이미 복제본이 있으면 스킵 (재분석 케이스).
    const { data: writingMeta } = await admin
      .from("user_personas")
      .select("user_id, display_name, source_blog_url, crawl_status, crawl_post_count, crawled_at, category, locked")
      .eq("id", personaId)
      .single();

    if (writingMeta && writingMeta.user_id) {
      const cloneIds: { writing: string; comment: string | null; reply: string | null } = {
        writing: personaId,
        comment: null,
        reply: null,
      };

      for (const targetPurpose of ["comment", "reply"] as const) {
        // 기존 복제본 확인 (재분석 케이스 — 동일 user_id + display_name + purpose)
        const { data: existingClone } = await admin
          .from("user_personas")
          .select("id")
          .eq("user_id", writingMeta.user_id)
          .eq("display_name", writingMeta.display_name || "")
          .eq("purpose", targetPurpose)
          .eq("is_system", false)
          .maybeSingle();

        let cloneId: string;

        if (existingClone) {
          // 기존 복제본의 ai 항목 삭제 후 새 항목 복사
          cloneId = existingClone.id;
          await admin
            .from("persona_items")
            .delete()
            .eq("persona_id", cloneId)
            .eq("source", "ai");
        } else {
          // 신규 복제본 생성
          const { data: newClone, error: cloneErr } = await admin
            .from("user_personas")
            .insert({
              user_id: writingMeta.user_id,
              display_name: writingMeta.display_name,
              source_blog_url: writingMeta.source_blog_url,
              crawl_status: "done",
              crawl_post_count: writingMeta.crawl_post_count,
              crawled_at: writingMeta.crawled_at,
              category: writingMeta.category,
              purpose: targetPurpose,
              is_system: false,
              locked: writingMeta.locked,
              is_default: false,
            })
            .select("id")
            .single();

          if (cloneErr || !newClone) {
            console.error(`${targetPurpose} 복제 실패:`, cloneErr);
            warnings.push(`${targetPurpose} 페르소나 자동 복제 실패`);
            continue;
          }
          cloneId = newClone.id;
        }

        // writing의 items를 복제본으로 복사
        const { data: writingItems } = await admin
          .from("persona_items")
          .select("category, key, value, priority, is_active, source")
          .eq("persona_id", personaId);

        if (writingItems && writingItems.length > 0) {
          const cloneRows = writingItems.map((it) => ({
            persona_id: cloneId,
            category: it.category,
            key: it.key,
            value: it.value,
            priority: it.priority,
            is_active: it.is_active,
            source: it.source,
          }));
          await admin.from("persona_items").insert(cloneRows);
        }

        if (targetPurpose === "comment") cloneIds.comment = cloneId;
        if (targetPurpose === "reply") cloneIds.reply = cloneId;
      }

      // 8. bot_settings 3슬롯 활성화 (기존 활성 슬롯이 비어있는 경우만)
      const { data: existingSettings } = await admin
        .from("bot_settings")
        .select("active_writing_persona_id, active_comment_persona_id, active_reply_persona_id")
        .eq("user_id", writingMeta.user_id)
        .maybeSingle();

      const slotUpdates: Record<string, string> = {};
      if (existingSettings && !existingSettings.active_writing_persona_id) {
        slotUpdates.active_writing_persona_id = cloneIds.writing;
      }
      if (existingSettings && !existingSettings.active_comment_persona_id && cloneIds.comment) {
        slotUpdates.active_comment_persona_id = cloneIds.comment;
      }
      if (existingSettings && !existingSettings.active_reply_persona_id && cloneIds.reply) {
        slotUpdates.active_reply_persona_id = cloneIds.reply;
      }

      if (Object.keys(slotUpdates).length > 0) {
        await admin
          .from("bot_settings")
          .update(slotUpdates)
          .eq("user_id", writingMeta.user_id);
      }
    }

    return NextResponse.json({
      personaId,
      itemCount: items.length,
      formattingCount: formattingRows.length,
      warnings,
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

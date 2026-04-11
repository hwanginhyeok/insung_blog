/**
 * Phase 2 마이그레이션 적용 전 영향 범위 확인 (read-only)
 *
 * 실행: NODE_PATH=apps/web/node_modules npx tsx scripts/dryrun_persona_v2.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const envContent = fs.readFileSync("apps/web/.env.local", "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  if (line.includes("=") && !line.startsWith("#")) {
    const [k, ...v] = line.split("=");
    env[k.trim()] = v.join("=").trim();
  }
}

const sb = createClient(
  env["NEXT_PUBLIC_SUPABASE_URL"],
  env["SUPABASE_SERVICE_ROLE_KEY"]
);

async function dryrun() {
  console.log("🔍 Phase 2 마이그레이션 영향 범위 확인 (read-only)\n");

  // 1. 'all' 페르소나 카운트
  const { data: allPersonas, count: allCount } = await sb
    .from("user_personas")
    .select("id, user_id, display_name", { count: "exact" })
    .eq("is_system", false)
    .eq("purpose", "all");

  console.log(`📌 사용자 'all' 페르소나: ${allCount}개`);
  for (const p of allPersonas || []) {
    console.log(`   - ${p.display_name || "(이름없음)"} (user=${p.user_id?.slice(0, 8)}...)`);
  }

  // 2. 영향받는 persona_items 카운트
  let totalItems = 0;
  for (const p of allPersonas || []) {
    const { count } = await sb
      .from("persona_items")
      .select("*", { count: "exact", head: true })
      .eq("persona_id", p.id);
    totalItems += count || 0;
  }
  console.log(`\n📌 복제될 persona_items: ${totalItems}개 (×3 = ${totalItems * 3}개로 증가)`);

  // 3. 영향받는 persona_feedback 카운트
  let totalFeedback = 0;
  for (const p of allPersonas || []) {
    const { count } = await sb
      .from("persona_feedback")
      .select("*", { count: "exact", head: true })
      .eq("persona_id", p.id);
    totalFeedback += count || 0;
  }
  console.log(`\n📌 writing으로 이전될 persona_feedback: ${totalFeedback}개`);

  // 4. bot_settings 재연결 대상
  const allIds = (allPersonas || []).map((p) => p.id);
  if (allIds.length > 0) {
    const { count: writingCount } = await sb
      .from("bot_settings")
      .select("*", { count: "exact", head: true })
      .in("active_writing_persona_id", allIds);
    const { count: commentCount } = await sb
      .from("bot_settings")
      .select("*", { count: "exact", head: true })
      .in("active_comment_persona_id", allIds);
    const { count: replyCount } = await sb
      .from("bot_settings")
      .select("*", { count: "exact", head: true })
      .in("active_reply_persona_id", allIds);

    console.log(`\n📌 bot_settings 재연결 대상:`);
    console.log(`   writing 슬롯: ${writingCount}건`);
    console.log(`   comment 슬롯: ${commentCount}건`);
    console.log(`   reply   슬롯: ${replyCount}건`);
  }

  // 5. is_default 분포 (충돌 사전 확인)
  const { data: defaults } = await sb
    .from("user_personas")
    .select("user_id, is_default")
    .eq("is_system", false)
    .eq("is_default", true);

  console.log(`\n📌 is_default=true 페르소나: ${defaults?.length || 0}개`);
  console.log(`   (모두 마이그레이션 후 false로 deprecated 처리됨)`);

  // 6. 시스템 페르소나 (영향 없음, 검증용)
  const { count: systemCount } = await sb
    .from("user_personas")
    .select("*", { count: "exact", head: true })
    .eq("is_system", true);
  console.log(`\n📌 시스템 페르소나: ${systemCount}개 (영향 없음)`);

  // 7. preview_samples 테이블 존재 여부
  const { error: previewErr } = await sb
    .from("persona_preview_samples")
    .select("id", { count: "exact", head: true });

  if (previewErr) {
    if (previewErr.message.includes("relation") || previewErr.message.includes("does not exist")) {
      console.log(`\n📌 persona_preview_samples 테이블: 미생성 (이번 마이그레이션이 생성)`);
    } else {
      console.log(`\n⚠️  persona_preview_samples 조회 에러:`, previewErr.message);
    }
  } else {
    console.log(`\n📌 persona_preview_samples 테이블: 이미 존재 (CREATE TABLE IF NOT EXISTS로 안전)`);
  }

  console.log(`\n✅ dry-run 완료. 위 카운트가 예상과 맞으면 supabase db push 실행하세요.`);
}

dryrun()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("dry-run 실패:", err);
    process.exit(1);
  });

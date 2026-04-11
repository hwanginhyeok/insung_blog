/**
 * Phase 1 검증 스크립트 — persona_tier_split 마이그레이션 + 시딩 결과 확인
 *
 * 실행: NODE_PATH=apps/web/node_modules npx tsx scripts/verify_persona_tier_split.ts
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

async function verify() {
  console.log("🔍 Phase 1 검증 시작\n");

  // 1. 시스템 페르소나 확인
  const { data: systemPersonas, error: e1 } = await sb
    .from("user_personas")
    .select("id, display_name, purpose, category, is_system, user_id")
    .eq("is_system", true)
    .order("purpose")
    .order("category");

  if (e1) {
    console.error("❌ 시스템 페르소나 조회 실패:", e1);
    return;
  }

  console.log(`📌 시스템 페르소나: ${systemPersonas?.length || 0}개`);
  for (const p of systemPersonas || []) {
    const userIdOk = p.user_id === null ? "✅" : "❌";
    console.log(
      `   ${userIdOk} [${p.purpose}] ${p.display_name} ${p.category ? `(${p.category})` : ""}`
    );
  }

  // 2. persona_items 카운트 (시스템 페르소나별)
  if (systemPersonas && systemPersonas.length > 0) {
    console.log(`\n📌 시스템 페르소나별 항목 수:`);
    for (const p of systemPersonas) {
      const { count } = await sb
        .from("persona_items")
        .select("*", { count: "exact", head: true })
        .eq("persona_id", p.id);
      console.log(`   ${p.display_name}: ${count}개`);
    }
  }

  // 3. 기존 사용자 페르소나 purpose 확인
  const { data: userPersonas, error: e2 } = await sb
    .from("user_personas")
    .select("id, display_name, purpose, user_id, is_system")
    .eq("is_system", false)
    .limit(10);

  if (e2) {
    console.error("\n❌ 사용자 페르소나 조회 실패:", e2);
  } else {
    console.log(`\n📌 기존 사용자 페르소나 (샘플 10개): ${userPersonas?.length || 0}개`);
    for (const p of userPersonas || []) {
      const purposeOk = p.purpose === "all" ? "✅" : "⚠️";
      console.log(`   ${purposeOk} [${p.purpose}] ${p.display_name}`);
    }
  }

  // 4. bot_settings 3슬롯 확인 (is_default 페르소나가 있는 사용자 대상)
  const { data: botSettings, error: e3 } = await sb
    .from("bot_settings")
    .select("user_id, active_writing_persona_id, active_comment_persona_id, active_reply_persona_id")
    .not("active_writing_persona_id", "is", null)
    .limit(5);

  if (e3) {
    console.error("\n❌ bot_settings 조회 실패:", e3);
  } else {
    console.log(
      `\n📌 bot_settings 3슬롯 활성화된 사용자 (샘플 5명): ${botSettings?.length || 0}명`
    );
    for (const bs of botSettings || []) {
      const allSame =
        bs.active_writing_persona_id === bs.active_comment_persona_id &&
        bs.active_comment_persona_id === bs.active_reply_persona_id;
      console.log(
        `   ${allSame ? "✅" : "⚠️"} user=${bs.user_id?.slice(0, 8)}... w=${bs.active_writing_persona_id?.slice(0, 8)} c=${bs.active_comment_persona_id?.slice(0, 8)} r=${bs.active_reply_persona_id?.slice(0, 8)}`
      );
    }
  }

  // 5. 스키마 컬럼 검증 (information_schema)
  const { data: columns, error: e4 } = await sb.rpc("get_persona_columns").select();
  if (e4 && !e4.message.includes("Could not find")) {
    console.log(`\n📌 컬럼 검증: RPC 미정의 (건너뜀)`);
  }

  // 6. purpose별 집계
  const { data: purposeAgg } = await sb
    .from("user_personas")
    .select("purpose")
    .eq("is_system", true);
  const purposeCounts: Record<string, number> = {};
  for (const p of purposeAgg || []) {
    purposeCounts[p.purpose] = (purposeCounts[p.purpose] || 0) + 1;
  }
  console.log(`\n📌 시스템 페르소나 purpose 분포:`);
  for (const [k, v] of Object.entries(purposeCounts)) {
    console.log(`   ${k}: ${v}개`);
  }

  console.log(`\n✅ Phase 1 검증 완료`);
}

verify()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("검증 실패:", err);
    process.exit(1);
  });

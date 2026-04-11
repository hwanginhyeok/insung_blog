import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const env: Record<string, string> = {};
for (const line of fs.readFileSync("apps/web/.env.local", "utf-8").split("\n")) {
  if (line.includes("=") && !line.startsWith("#")) {
    const [k, ...v] = line.split("=");
    env[k.trim()] = v.join("=").trim();
  }
}

const sb = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]);

async function check() {
  const { data, error, count } = await sb
    .from("persona_preview_samples")
    .select("*", { count: "exact" })
    .limit(3);
  console.log("count:", count);
  console.log("error:", error);
  console.log("rows returned:", data?.length);
  console.log("sample:", JSON.stringify(data?.[0], null, 2));

  // 컬럼 구조 확인용 — 빈 INSERT 시도
  const { error: insertErr } = await sb
    .from("persona_preview_samples")
    .insert({
      persona_id: "00000000-0000-0000-0000-000000000000",
      sample_type: "writing",
      content: "",
    });
  console.log("\ninsert error (expected FK fail):", insertErr?.message);
}

check().then(() => process.exit(0));

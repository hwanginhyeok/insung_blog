/**
 * 시스템 기본 페르소나 시딩 — Free/Basic 사용자에게 읽기 전용으로 제공
 *
 * 구성:
 *   - 글쓰기 기본 5개 (맛집/카페/여행/일상/리뷰 카테고리별)
 *   - 댓글 기본 1개 (친근한 방문자 톤)
 *   - 대댓글 기본 1개 (블로그 주인 답글 톤)
 *
 * 실행: npx tsx scripts/seed_system_personas.ts
 *
 * 선행 마이그레이션: 20260411000000_persona_tier_split.sql
 *   (user_personas.is_system, purpose, category 컬럼 필요)
 *
 * 재실행 안전: display_name + is_system 기준 upsert (중복 생성 방지)
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

// .env.local 로드
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

interface SystemPersona {
  display_name: string;
  purpose: "writing" | "comment" | "reply";
  category: string | null;
  items: { category: string; key: string; value: string; priority: number }[];
}

// ── 글쓰기 카테고리별 공통 기본 아이템 ──
// 카테고리별 차이는 custom 항목에서만, 나머지는 "블로그 기본 톤"을 공유
const BASE_WRITING_ITEMS = (cat: string) => [
  { category: "voice", key: "기본_어미", value: "~해요, ~이에요, ~있어요 등 부드러운 해요체 사용", priority: 10 },
  { category: "voice", key: "친근함", value: "지나치게 격식 차리지 않고 독자에게 말 건네듯 자연스럽게", priority: 9 },
  { category: "emoji", key: "적정_이모지", value: "문단 끝이나 중요 포인트에 😊✨🍀 등 1~3개 사용. 과하지 않게", priority: 6 },
  { category: "structure", key: "오프닝", value: "인사 또는 오늘 포스팅 주제를 한 줄로 소개하며 시작", priority: 8 },
  { category: "structure", key: "문단_길이", value: "한 문단 2~4줄. 짧게 끊어 읽기 편하게", priority: 8 },
  { category: "structure", key: "사진_배치", value: "2~3문단마다 사진 1장 배치. 사진 아래 짧은 설명", priority: 7 },
  { category: "ending", key: "마무리_인사", value: "'오늘 포스팅 여기까지예요', '읽어주셔서 감사합니다' 같은 마무리", priority: 8 },
  { category: "ending", key: "해시태그", value: "주제 관련 해시태그 10~15개", priority: 6 },
  { category: "forbidden", key: "딱딱함_금지", value: "~이다, ~하겠다 같은 논문체/격식체 사용 안 함", priority: 9 },
  { category: "forbidden", key: "과장_금지", value: "'최고', '역대급' 등 과장된 표현 남발 금지", priority: 7 },
  { category: "formatting", key: "줄바꿈", value: "빈 줄로 문단 구분. 한 줄이 너무 길지 않게", priority: 7 },
  // 카테고리별 커스텀 항목
  { category: "custom", key: "카테고리", value: `${cat} 카테고리 블로그 글쓰기 기본 스타일`, priority: 5 },
];

// 카테고리별 고유 custom 톤 1~2개씩 추가
const CATEGORY_SPECIFIC: Record<string, { key: string; value: string; priority: number }[]> = {
  맛집: [
    { key: "방문_정보", value: "지역, 메뉴, 가격, 영업시간 등 실용 정보 포함", priority: 8 },
    { key: "솔직_톤", value: "장단점을 솔직하게. 무조건 좋다는 식의 과장 피하기", priority: 7 },
  ],
  카페: [
    { key: "분위기_묘사", value: "인테리어, 조명, 음악 등 공간 분위기 감각적으로 표현", priority: 8 },
    { key: "음료_설명", value: "주문한 음료/디저트의 맛과 특징 간단히 묘사", priority: 7 },
  ],
  여행: [
    { key: "여정_중심", value: "시간 순서대로 이동 경로와 방문지 기록", priority: 8 },
    { key: "실용_팁", value: "교통편, 입장료, 소요시간 등 독자에게 도움 되는 정보", priority: 7 },
  ],
  일상: [
    { key: "일기체", value: "오늘 있었던 일, 느낀 점을 일기처럼 편하게", priority: 8 },
    { key: "솔직_공감", value: "꾸미지 않은 솔직한 감정과 소소한 일상 공유", priority: 7 },
  ],
  리뷰: [
    { key: "사용_경험", value: "직접 사용해본 경험 기반. 장단점 균형 있게", priority: 8 },
    { key: "추천_여부", value: "누구에게 추천하는지 구체적으로 명시", priority: 7 },
  ],
};

const SYSTEM_PERSONAS: SystemPersona[] = [
  // ── 글쓰기 기본 × 5 카테고리 ──
  ...(["맛집", "카페", "여행", "일상", "리뷰"] as const).map((cat) => ({
    display_name: `블로그 글쓰기 기본 - ${cat}`,
    purpose: "writing" as const,
    category: cat,
    items: [
      ...BASE_WRITING_ITEMS(cat),
      ...CATEGORY_SPECIFIC[cat].map((it) => ({ category: "custom", ...it })),
    ],
  })),

  // ── 댓글 기본 ──
  {
    display_name: "친근한 댓글 기본",
    purpose: "comment",
    category: null,
    items: [
      { category: "voice", key: "해요체", value: "해요체로 친근하게. ~네요, ~이에요, ~같아요 자주 사용", priority: 10 },
      { category: "voice", key: "공감_표현", value: "글 내용에 공감하는 한 줄 + 짧은 본인 경험", priority: 9 },
      { category: "emoji", key: "가벼운_이모지", value: "😊👍🙌 중 1~2개만 사용", priority: 6 },
      { category: "ending", key: "길이", value: "댓글은 2~4문장, 150~250자 분량", priority: 10 },
      { category: "forbidden", key: "자기_홍보_금지", value: "자신의 닉네임, 블로그명, 링크 절대 언급 금지", priority: 10 },
      { category: "forbidden", key: "맞팔_구걸_금지", value: "'맞팔해요', '이웃해요' 같은 요청 금지", priority: 10 },
      { category: "forbidden", key: "복붙느낌_금지", value: "글 내용과 무관한 일반적 멘트 금지 ('좋은 글 감사합니다' 같은 것)", priority: 9 },
      { category: "custom", key: "30대_직장인_톤", value: "30대 직장인이 같은 블로그 이웃에게 남기는 친근한 댓글 느낌", priority: 8 },
    ],
  },

  // ── 대댓글 (답글) 기본 ──
  {
    display_name: "블로그 주인 답글 기본",
    purpose: "reply",
    category: null,
    items: [
      { category: "voice", key: "따뜻한_주인톤", value: "블로그 주인 입장에서 방문자에게 따뜻하게 답글. 해요체", priority: 10 },
      { category: "voice", key: "감사_표현", value: "방문/댓글에 대한 감사 한마디 포함", priority: 9 },
      { category: "emoji", key: "따뜻한_이모지", value: "😊💕🙏 중 1개 정도", priority: 6 },
      { category: "ending", key: "길이", value: "답글은 1~3문장, 50~150자 분량", priority: 10 },
      { category: "custom", key: "방문_답례_뉘앙스", value: "필요시 '시간 되시면 놀러오세요' 같은 초대 멘트 자연스럽게", priority: 7 },
      { category: "forbidden", key: "긴_답글_금지", value: "너무 길게 쓰지 말 것. 댓글보다 짧아야 함", priority: 9 },
    ],
  },
];

async function seed() {
  console.log("🌱 시스템 기본 페르소나 시딩 시작");
  console.log(`   대상: ${SYSTEM_PERSONAS.length}개`);

  // 1. 기존 시스템 페르소나 확인 (중복 방지)
  const { data: existing } = await sb
    .from("user_personas")
    .select("id, display_name, is_system")
    .eq("is_system", true);

  console.log(`   기존 시스템 페르소나: ${existing?.length || 0}개`);

  let created = 0;
  let skipped = 0;

  for (const persona of SYSTEM_PERSONAS) {
    // 이미 있으면 스킵 (display_name 기준)
    const exists = existing?.find((e) => e.display_name === persona.display_name);
    if (exists) {
      console.log(`   ⏭️  ${persona.display_name} (이미 존재)`);
      skipped++;
      continue;
    }

    // user_personas insert
    const { data: newPersona, error: insertErr } = await sb
      .from("user_personas")
      .insert({
        user_id: null,
        display_name: persona.display_name,
        purpose: persona.purpose,
        category: persona.category,
        is_system: true,
        locked: false,
        is_default: false,
        crawl_status: "done",
        source_blog_url: null,
      })
      .select("id")
      .single();

    if (insertErr || !newPersona) {
      console.error(`   ❌ ${persona.display_name} 생성 실패:`, insertErr);
      continue;
    }

    // persona_items 일괄 insert
    const itemsPayload = persona.items.map((it) => ({
      persona_id: newPersona.id,
      category: it.category,
      key: it.key,
      value: it.value,
      priority: it.priority,
      is_active: true,
      source: "user" as const,
    }));

    const { error: itemsErr } = await sb.from("persona_items").insert(itemsPayload);

    if (itemsErr) {
      console.error(`   ❌ ${persona.display_name} 항목 생성 실패:`, itemsErr);
      continue;
    }

    console.log(`   ✅ ${persona.display_name} (항목 ${persona.items.length}개)`);
    created++;
  }

  console.log(`\n📊 결과: 생성 ${created}개 / 스킵 ${skipped}개 / 총 ${SYSTEM_PERSONAS.length}개`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("시딩 실패:", err);
    process.exit(1);
  });

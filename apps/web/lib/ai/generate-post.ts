/**
 * AI 블로그 글 생성 — content_generator.py의 TS 포팅
 *
 * 4단계 파이프라인:
 *  1. Vision → 사진 분석 (각 사진 객관적 묘사)
 *  2. 카테고리 감지 (사용자 미선택 시)
 *  3. 페르소나 기반 초안 생성 (DB 페르소나 → 폴백: PRODUCTION_SPEC)
 *  4. 해시태그 생성 (3계층: 위치/카테고리/감성)
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { createAdminClient } from "@/lib/supabase-admin";
import { BLOG_CATEGORIES } from "@/lib/constants";

// ── 설정 상수 (Python config/settings.py 대응) ──
const CONTENT_MODEL = "claude-haiku-4-5-20251001";
const HASHTAG_MODEL = "claude-haiku-4-5-20251001";
const CATEGORIES = BLOG_CATEGORIES;
const DEFAULT_CATEGORY = "일상";
const POST_BODY_MIN_CHARS = 300;
const POST_BODY_MAX_CHARS = 1500;
const POST_TITLE_MAX_CHARS = 40;
const HASHTAG_MIN_COUNT = 15;
const HASHTAG_MAX_COUNT = 25;

export interface GenerateResult {
  title: string;
  body: string;
  hashtags: string[];
  category: string;
}

interface PhotoInput {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

let cachedSpec: string | null = null;

function loadProductionSpec(): string {
  if (cachedSpec) return cachedSpec;

  const specPath = path.join(process.cwd(), "data", "production-spec.md");
  if (!fs.existsSync(specPath)) {
    console.warn("PRODUCTION_SPEC 없음:", specPath);
    return "";
  }

  const full = fs.readFileSync(specPath, "utf-8");

  // 섹션 13 이전까지만 포함 (토큰 절약)
  const marker = "## 13. 전체 흐름 예시";
  const idx = full.indexOf(marker);
  cachedSpec = idx > 0 ? full.slice(0, idx).trimEnd() : full;
  return cachedSpec;
}

// ── DB 페르소나 로드 (W5-05A) ──

interface PersonaItemRow {
  category: string;
  key: string;
  value: string;
  priority: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  voice: "말투",
  emoji: "이모지",
  structure: "글 구조",
  ending: "마무리",
  forbidden: "금지 사항",
  custom: "기타 규칙",
  formatting: "텍스트 포맷팅",
};

/** persona_items → 시스템 프롬프트용 스타일 가이드 텍스트 */
function renderPersonaToPrompt(items: PersonaItemRow[]): string {
  const grouped = new Map<string, PersonaItemRow[]>();
  for (const item of items) {
    const group = grouped.get(item.category) || [];
    group.push(item);
    grouped.set(item.category, group);
  }

  const sections: string[] = ["=== 블로그 스타일 가이드 ===\n"];

  for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
    const catItems = grouped.get(cat);
    if (!catItems?.length) continue;

    sections.push(`## ${label}`);
    for (const item of catItems) {
      const tag =
        item.priority >= 7
          ? " (필수)"
          : item.priority >= 4
            ? " (자주)"
            : "";
      sections.push(`- ${item.key}: ${item.value}${tag}`);
    }
    sections.push("");
  }

  return sections.join("\n");
}

interface PersonaLoadResult {
  spec: string;
  /** 카테고리별 추가 지시 (key = 맛집/카페/여행/일상/기타) */
  categoryPrompts: Record<string, string>;
}

/**
 * DB에서 사용자 페르소나 로드 → 스타일 프롬프트 + 카테고리별 지시 반환
 * 페르소나가 없거나 분석 미완료면 null 반환 (→ PRODUCTION_SPEC 폴백)
 * @param personaId 특정 페르소나 ID (없으면 기본 페르소나 사용)
 */
async function loadUserPersona(userId: string, personaId?: string): Promise<PersonaLoadResult | null> {
  try {
    const admin = createAdminClient();

    let query = admin
      .from("user_personas")
      .select("id")
      .eq("user_id", userId)
      .eq("crawl_status", "done");

    if (personaId) {
      query = query.eq("id", personaId);
    } else {
      query = query.eq("is_default", true);
    }

    const { data: persona } = await query.maybeSingle();

    if (!persona) return null;

    const { data: items } = await admin
      .from("persona_items")
      .select("category, key, value, priority")
      .eq("persona_id", persona.id)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (!items?.length) return null;

    // 카테고리별 지시 분리 (category_prompt → 블로그 카테고리별 추가 지시)
    const regularItems = items.filter(i => i.category !== "category_prompt");
    const categoryPrompts: Record<string, string> = {};
    for (const item of items.filter(i => i.category === "category_prompt")) {
      categoryPrompts[item.key] = item.value;
    }

    return {
      spec: regularItems.length > 0 ? renderPersonaToPrompt(regularItems) : "",
      categoryPrompts,
    };
  } catch {
    return null;
  }
}

/** Step 1: Claude Vision으로 사진 분석 */
async function analyzeImages(
  client: Anthropic,
  photos: PhotoInput[]
): Promise<string> {
  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  for (const photo of photos) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: photo.mediaType,
        data: photo.base64,
      },
    });
  }

  content.push({
    type: "text",
    text:
      `사진 ${photos.length}장을 각각 번호를 매겨 분석해줘. ` +
      "사진에 보이는 것만 묘사하고, 추측하지 마.\n\n" +
      "각 사진을 아래 형식으로 분석:\n" +
      "사진 1: [장소/음식/분위기/디테일]\n" +
      "사진 2: [장소/음식/분위기/디테일]\n...\n\n" +
      "분석 항목:\n" +
      "1. 장소 종류 (카페, 식당, 집, 야외 등)\n" +
      "2. 음식이 있다면 외관 묘사\n" +
      "3. 전반적인 분위기/인테리어\n" +
      "4. 눈에 띄는 디테일",
  });

  const response = await client.messages.create({
    model: CONTENT_MODEL,
    max_tokens: 800,
    messages: [{ role: "user", content }],
  });

  return response.content[0].type === "text"
    ? response.content[0].text.trim()
    : "";
}

/** Step 2: 카테고리 자동 감지 */
async function detectCategory(
  client: Anthropic,
  analysis: string,
  memo: string
): Promise<string> {
  const categoriesStr = CATEGORIES.join(", ");
  let prompt =
    `아래 사진 분석 결과를 보고, 블로그 카테고리를 하나만 골라줘.\n` +
    `선택지: ${categoriesStr}\n` +
    `카테고리 이름만 출력해. 다른 텍스트 절대 금지.\n\n` +
    `[사진 분석]\n${analysis.slice(0, 500)}`;

  if (memo) prompt += `\n[메모] ${memo}`;

  try {
    const response = await client.messages.create({
      model: CONTENT_MODEL,
      max_tokens: 10,
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "";

    for (const cat of CATEGORIES) {
      if (raw.includes(cat)) return cat;
    }
  } catch (e) {
    console.warn("카테고리 감지 오류:", e);
  }

  return DEFAULT_CATEGORY;
}

/** AI 응답에서 title/body JSON 추출 (여러 폴백 전략) */
function parseDraftJson(raw: string): { title: string; body: string } {
  // 코드블록 래핑 제거
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    if (lines[lines.length - 1].trim() === "```") {
      cleaned = lines.slice(1, -1).join("\n");
    } else {
      cleaned = lines.slice(1).join("\n");
    }
  }

  // 1차: 표준 JSON 파싱
  try {
    const result = JSON.parse(cleaned);
    if (result.title?.trim() && result.body?.trim()) {
      return { title: result.title.trim(), body: result.body.trim() };
    }
  } catch {
    // 폴백으로 진행
  }

  // 2차: Regex 추출
  const titleMatch = cleaned.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const bodyMatch = cleaned.match(/"body"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/)

  if (titleMatch && bodyMatch) {
    let title = titleMatch[1];
    let body = bodyMatch[1];
    // JSON 이스케이프 복원
    for (const [esc, char] of [
      ['\\"', '"'],
      ["\\n", "\n"],
      ["\\t", "\t"],
      ["\\\\", "\\"],
    ]) {
      title = title.replaceAll(esc, char);
      body = body.replaceAll(esc, char);
    }
    if (title.trim() && body.trim()) {
      return { title: title.trim(), body: body.trim() };
    }
  }

  throw new Error("AI 초안 JSON 파싱 실패");
}

/** Step 3: 페르소나 기반 초안 생성 (DB 페르소나 → 폴백: PRODUCTION_SPEC) */
async function generateDraft(
  client: Anthropic,
  analysis: string,
  memo: string,
  category: string,
  spec: string,
  categoryInstruction: string | null = null
): Promise<{ title: string; body: string }> {

  let systemPrompt = `너는 네이버 블로그 작성자야. 아래 제작 스펙을 **반드시 준수**하여 블로그 게시물을 작성해.

${spec}

=== 최종 출력 규칙 ===
- 카테고리: ${category}
- 제목은 ${POST_TITLE_MAX_CHARS}자 이내
- 본문은 ${POST_BODY_MIN_CHARS}~${POST_BODY_MAX_CHARS}자
- body에 줄바꿈은 \\n으로 표현
- 사진 위치를 [PHOTO_1], [PHOTO_2], ... 마커로 표시 (반드시 단독 줄에 배치)
- 사진 분석의 번호와 마커 번호를 일치시킬 것
- 각 마커 앞뒤로 해당 사진에 대한 코멘터리 2~4줄 작성
- 출력 형식: 반드시 아래 JSON만 출력. 인사말, 설명, 마크다운 등 다른 텍스트 절대 금지.
{"title": "제목", "body": "본문"}`;

  if (categoryInstruction) {
    systemPrompt += `\n\n=== 카테고리별 추가 지시 (${category}) ===\n${categoryInstruction}`;
  }

  let userMessage = `[사진 분석 결과]\n${analysis}`;
  if (memo) userMessage += `\n\n[메모]\n${memo}`;

  const response = await client.messages.create({
    model: CONTENT_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: '{"title":' },
    ],
  });

  const raw =
    '{"title":' +
    (response.content[0].type === "text" ? response.content[0].text.trim() : "");

  return parseDraftJson(raw);
}

/** Step 4: 해시태그 생성 */
async function generateHashtags(
  client: Anthropic,
  title: string,
  body: string
): Promise<string[]> {
  const systemPrompt = `네이버 블로그 해시태그를 생성해.
규칙:
- 총 ${HASHTAG_MIN_COUNT}~${HASHTAG_MAX_COUNT}개
- 3계층: 위치 태그, 카테고리 태그, 감성 태그
- # 없이 태그 텍스트만
- 줄바꿈으로 구분, 태그 텍스트만 출력
- 검색 유입에 효과적인 태그 선정`;

  const response = await client.messages.create({
    model: HASHTAG_MODEL,
    max_tokens: 500,
    system: systemPrompt,
    messages: [
      { role: "user", content: `[제목] ${title}\n\n[본문]\n${body.slice(0, 800)}` },
    ],
  });

  const raw =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const tags: string[] = [];
  for (const line of raw.split("\n")) {
    let tag = line.trim().replace(/^#/, "").trim();
    if (!tag || tag.startsWith("-")) continue;
    // "1. 태그" 형태 번호 제거
    const parts = tag.split(".", 2);
    if (parts.length === 2 && /^\d+$/.test(parts[0].trim())) {
      tag = parts[1].trim();
    }
    if (tag) tags.push(tag);
  }

  return tags.slice(0, HASHTAG_MAX_COUNT);
}

/**
 * 메인 함수: 사진 + 메모 → AI 블로그 초안
 * @param userId 사용자 ID (있으면 DB 페르소나 로드, 없으면 PRODUCTION_SPEC)
 * @param personaId 특정 페르소나 ID (없으면 기본 페르소나 사용)
 */
export async function generatePost(
  photos: PhotoInput[],
  memo: string,
  userCategory: string | null,
  userId?: string,
  personaId?: string
): Promise<GenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다");
  }

  const client = new Anthropic({ apiKey });

  // 페르소나 로드 (DB → 폴백: PRODUCTION_SPEC)
  const personaResult = userId ? await loadUserPersona(userId, personaId) : null;
  const spec = personaResult?.spec || loadProductionSpec();

  // Step 1: 사진 분석
  const analysis = await analyzeImages(client, photos);

  // Step 2: 카테고리 감지 (사용자 선택 있으면 스킵)
  const category = userCategory || (await detectCategory(client, analysis, memo));

  // Step 3: 초안 생성 (카테고리별 추가 지시 포함)
  const categoryInstruction = personaResult?.categoryPrompts[category] || null;
  const draft = await generateDraft(client, analysis, memo, category, spec, categoryInstruction);

  // Step 4: 해시태그
  const hashtags = await generateHashtags(client, draft.title, draft.body);

  return {
    title: draft.title,
    body: draft.body,
    hashtags,
    category,
  };
}

/**
 * 재생성: 이전 초안 + 피드백 → 수정된 초안.
 * Vision 단계 생략 — 비용/시간 절약.
 * @param userId 사용자 ID (있으면 DB 페르소나 로드)
 * @param personaId 특정 페르소나 ID (없으면 기본 페르소나 사용)
 */
export async function regeneratePost(
  previousTitle: string,
  previousBody: string,
  feedback: string,
  category: string,
  userId?: string,
  personaId?: string
): Promise<GenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다");
  }

  const client = new Anthropic({ apiKey });
  const personaResult = userId ? await loadUserPersona(userId, personaId) : null;
  const spec = personaResult?.spec || loadProductionSpec();
  const categoryInstruction = personaResult?.categoryPrompts[category] || null;

  let systemPrompt = `너는 네이버 블로그 작성자야. 아래 제작 스펙을 준수하여 블로그 게시물을 **수정**해.

${spec}

=== 수정 규칙 ===
- 카테고리: ${category}
- 사용자 피드백을 **정확히** 반영하여 수정
- 피드백에서 언급하지 않은 부분은 기존 내용 유지
- 제목은 ${POST_TITLE_MAX_CHARS}자 이내
- 본문은 ${POST_BODY_MIN_CHARS}~${POST_BODY_MAX_CHARS}자
- body에 줄바꿈은 \\n으로 표현
- [PHOTO_N] 마커 위치는 유지 (피드백에서 변경 요청하지 않는 한)
- 출력 형식: 반드시 아래 JSON만 출력. 다른 텍스트 절대 금지.
{"title": "제목", "body": "본문"}`;

  if (categoryInstruction) {
    systemPrompt += `\n\n=== 카테고리별 추가 지시 (${category}) ===\n${categoryInstruction}`;
  }

  const userMessage = `[기존 제목]\n${previousTitle}\n\n[기존 본문]\n${previousBody}\n\n[수정 요청]\n${feedback}`;

  const response = await client.messages.create({
    model: CONTENT_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: '{"title":' },
    ],
  });

  const raw =
    '{"title":' +
    (response.content[0].type === "text" ? response.content[0].text.trim() : "");

  const draft = parseDraftJson(raw);
  const hashtags = await generateHashtags(client, draft.title, draft.body);

  return {
    title: draft.title,
    body: draft.body,
    hashtags,
    category,
  };
}

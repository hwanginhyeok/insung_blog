/**
 * 페르소나 AI 분석 — 크롤링 데이터 → 2-pass 분석 → persona_items
 *
 * Pass 1: 콘텐츠 분석 (voice, emoji, structure, ending, forbidden, custom)
 * Pass 2: 포맷팅 분석 (formatting — HTML 메타데이터 기반)
 *
 * 모델: Sonnet (1회성 분석, 정확도 우선)
 */
import Anthropic from "@anthropic-ai/sdk";
import type { CrawledPost, CrawlResult } from "@/lib/crawl/naver-blog";

// ── 설정 ──

const ANALYSIS_MODEL = "claude-sonnet-4-5-20250929";

// ── 타입 ──

export interface PersonaItem {
  category:
    | "voice"
    | "emoji"
    | "structure"
    | "ending"
    | "forbidden"
    | "custom"
    | "formatting";
  key: string;
  value: string;
  priority: number;
}

// ── 요약 생성 유틸 ──

/** 콘텐츠 분석용: 게시물 텍스트 요약 */
function buildContentSummary(posts: CrawledPost[]): string {
  return posts
    .map(
      (p, i) =>
        `--- 게시물 ${i + 1} ---\n` +
        `제목: ${p.title}\n` +
        `카테고리: ${p.category || "없음"}\n` +
        `본문 (${p.body_length}자):\n${p.body.slice(0, 800)}\n`
    )
    .join("\n");
}

/** 포맷팅 분석용: HTML 메타데이터 통계 집계 */
function buildFormattingSummary(
  posts: CrawledPost[],
  fontSummary: CrawlResult["fontSummary"]
): string {
  let totalTextBlocks = 0;
  let totalEmptyBlocks = 0;
  let totalAlignLeft = 0;
  let totalAlignCenter = 0;
  const allBoldTexts: string[] = [];
  const allCenterTexts: string[] = [];
  const allColorSpans: { color: string; text: string }[] = [];
  const blockPatterns: string[][] = [];

  for (const post of posts) {
    const m = post.htmlMeta;
    totalTextBlocks += m.total_text_blocks;
    totalEmptyBlocks += m.empty_text_blocks;
    totalAlignLeft += m.align_left;
    totalAlignCenter += m.align_center;
    allBoldTexts.push(...m.bold_texts);
    allCenterTexts.push(...m.center_texts);
    allColorSpans.push(...m.color_spans);
    blockPatterns.push(m.block_sequence.map((b) => b.type));
  }

  const emptyRatio =
    totalTextBlocks > 0
      ? ((totalEmptyBlocks / totalTextBlocks) * 100).toFixed(1)
      : "0";

  const lines: string[] = [
    `=== 폰트 통계 (${posts.length}편 종합) ===`,
    `주 사용 폰트: ${fontSummary.primary_font || "미확인"}`,
    `주 사용 크기: ${fontSummary.primary_size || "미확인"}`,
    `폰트 빈도: ${JSON.stringify(fontSummary.font_classes)}`,
    `크기 빈도: ${JSON.stringify(fontSummary.size_classes)}`,
    ``,
    `=== 줄 간격 패턴 ===`,
    `전체 텍스트 블록: ${totalTextBlocks}`,
    `빈 텍스트 블록 (줄 간격 역할): ${totalEmptyBlocks}`,
    `빈 줄 비율: ${emptyRatio}%`,
    ``,
    `=== 정렬 패턴 ===`,
    `좌측정렬: ${totalAlignLeft}`,
    `중앙정렬: ${totalAlignCenter}`,
  ];

  if (allCenterTexts.length > 0) {
    lines.push(
      `중앙정렬 텍스트 샘플: ${allCenterTexts.slice(0, 10).join(" | ")}`
    );
  }

  lines.push(``, `=== 볼드 패턴 ===`);
  if (allBoldTexts.length > 0) {
    lines.push(
      `볼드 텍스트 샘플: ${allBoldTexts.slice(0, 15).join(" | ")}`
    );
  } else {
    lines.push(`볼드 사용 없음`);
  }

  lines.push(``, `=== 색상 사용 ===`);
  if (allColorSpans.length > 0) {
    lines.push(
      `색상 스팬 샘플: ${allColorSpans
        .slice(0, 10)
        .map((s) => `${s.color}: "${s.text}"`)
        .join(" | ")}`
    );
  } else {
    lines.push(`색상 사용 없음`);
  }

  lines.push(``, `=== 블록 배치 패턴 (처음 5편) ===`);
  for (let i = 0; i < Math.min(5, blockPatterns.length); i++) {
    lines.push(`게시물 ${i + 1}: ${blockPatterns[i].join(" → ")}`);
  }

  return lines.join("\n");
}

// ── JSON 파싱 ──

/** AI 응답에서 PersonaItem[] 추출 (여러 폴백 전략) */
function parsePersonaItems(
  raw: string,
  forcedCategory?: PersonaItem["category"]
): PersonaItem[] {
  let cleaned = raw.trim();

  // 마크다운 코드블록 제거
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    if (lines[lines.length - 1].trim() === "```") {
      cleaned = lines.slice(1, -1).join("\n");
    } else {
      cleaned = lines.slice(1).join("\n");
    }
  }

  // JSON 배열 경계 추출
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }

  const validCategories = new Set([
    "voice",
    "emoji",
    "structure",
    "ending",
    "forbidden",
    "custom",
    "formatting",
  ]);

  try {
    const items = JSON.parse(cleaned) as Array<{
      category?: string;
      key?: string;
      value?: string;
      priority?: number;
    }>;

    return items
      .filter((item) => {
        const cat = forcedCategory || item.category;
        return cat && validCategories.has(cat) && item.key && item.value;
      })
      .map((item) => ({
        category: (forcedCategory ||
          item.category) as PersonaItem["category"],
        key: item.key!,
        value: item.value!,
        priority: Math.min(10, Math.max(1, item.priority ?? 1)),
      }));
  } catch (e) {
    console.error("페르소나 항목 JSON 파싱 실패:", e);
    console.error("원문:", cleaned.slice(0, 500));
    return [];
  }
}

// ── Pass 1: 콘텐츠 분석 ──

async function analyzeContent(
  client: Anthropic,
  posts: CrawledPost[]
): Promise<PersonaItem[]> {
  const summary = buildContentSummary(posts);

  const systemPrompt = `너는 블로그 글쓰기 스타일 분석 전문가야.
주어진 블로그 글들의 **공통 패턴**을 카테고리별로 추출해.
실제 게시물에서 반복적으로 나타나는 구체적인 패턴만 추출해.

카테고리:
- voice: 어미, 말투, 특유의 표현 (예: "~했어요", "~더라구요", "진짜", "완전")
- emoji: 사용하는 이모지와 규칙 (빈도, 위치 — 문장 끝/제목/단독줄)
- structure: 글 구조 패턴 (오프닝 방식, 사진-글 배치, 섹션 구분법)
- ending: 마무리 패턴 (추천 문구, CTA, 해시태그 앞 멘트)
- forbidden: 절대 쓰지 않는 표현 (격식체, 특정 이모지 등)
- custom: 자기지칭, 독자호칭, 특수 문구 등 독특한 패턴

출력 형식: JSON 배열만 출력. 다른 텍스트 절대 금지.
[
  { "category": "voice", "key": "패턴명", "value": "구체적 설명과 예시", "priority": 빈도 },
  ...
]

priority 기준 (1~10):
- 1~3: 간혹 사용
- 4~6: 자주 사용
- 7~10: 거의 항상 사용`;

  const response = await client.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 3000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `아래 블로그 게시물 ${posts.length}편을 분석해줘.\n\n${summary}`,
      },
      { role: "assistant", content: "[" },
    ],
  });

  const raw =
    "[" +
    (response.content[0].type === "text" ? response.content[0].text.trim() : "");

  return parsePersonaItems(raw);
}

// ── Pass 2: 포맷팅 분석 ──

async function analyzeFormatting(
  client: Anthropic,
  posts: CrawledPost[],
  fontSummary: CrawlResult["fontSummary"]
): Promise<PersonaItem[]> {
  const summary = buildFormattingSummary(posts, fontSummary);

  const systemPrompt = `너는 네이버 블로그 HTML 포맷팅 패턴 분석 전문가야.
SmartEditor HTML 메타데이터 통계에서 시각적 포맷팅 패턴을 추출해.

분석 항목 (key로 사용):
1. primary_font — 주 사용 폰트 (se-ff-* 클래스명에서 접두사 제거한 값)
2. primary_size — 주 사용 크기 (se-fs-* 클래스명에서 접두사 제거한 값)
3. title_size — 제목 크기 (있다면)
4. line_spacing — 문단 간 빈 줄 패턴 설명 (예: "문단 사이 빈 줄 1~2개")
5. alignment — 정렬 패턴 (예: "본문 좌측정렬, 장소명/가격 중앙정렬")
6. bold_usage — 볼드 적용 패턴 (예: "장소명, 메뉴명에 볼드")
7. color_usage — 텍스트 색상 패턴 (예: "미사용" 또는 "가격에 빨간색")
8. block_layout — 텍스트-사진 교차 패턴 (예: "텍스트 2~3줄 → 사진 → 반복")

출력 형식: JSON 배열만 출력. 다른 텍스트 절대 금지.
모든 항목의 category는 "formatting"으로 고정.
[
  { "category": "formatting", "key": "primary_font", "value": "nanumbareunhipi", "priority": 10 },
  { "category": "formatting", "key": "primary_size", "value": "fs16", "priority": 10 },
  ...
]

priority는 해당 패턴의 일관성 (1~10):
- 7~10: 거의 항상 동일하게 사용
- 4~6: 자주 사용하지만 가끔 다른 값도
- 1~3: 가끔 사용`;

  const response = await client.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `아래 HTML 포맷팅 통계를 분석해줘.\n\n${summary}`,
      },
      { role: "assistant", content: "[" },
    ],
  });

  const raw =
    "[" +
    (response.content[0].type === "text" ? response.content[0].text.trim() : "");

  return parsePersonaItems(raw, "formatting");
}

// ── 메인 ──

/**
 * 크롤링 결과 → 2-pass AI 분석 → PersonaItem[]
 *
 * Pass 1: 콘텐츠 (voice, emoji, structure, ending, forbidden, custom)
 * Pass 2: 포맷팅 (formatting — HTML 메타데이터 기반)
 */
export interface AnalysisResult {
  items: PersonaItem[];
  warnings: string[];
}

export async function analyzePersona(
  posts: CrawledPost[],
  fontSummary: CrawlResult["fontSummary"]
): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다");
  }

  const client = new Anthropic({ apiKey });
  const warnings: string[] = [];

  // Pass 1: 콘텐츠 분석 (Sonnet)
  const contentItems = await analyzeContent(client, posts);
  console.log(`[페르소나] Pass 1 콘텐츠 분석 완료: ${contentItems.length}건`);

  // Pass 2: 포맷팅 분석 (Sonnet) — 실패 시 1회 재시도
  let formattingItems = await analyzeFormatting(client, posts, fontSummary);
  console.log(`[페르소나] Pass 2 포맷팅 분석 완료: ${formattingItems.length}건`);

  if (formattingItems.length === 0) {
    console.warn("[페르소나] Pass 2 포맷팅 0건 — 1회 재시도");
    formattingItems = await analyzeFormatting(client, posts, fontSummary);
    console.log(`[페르소나] Pass 2 재시도 결과: ${formattingItems.length}건`);

    if (formattingItems.length === 0) {
      warnings.push("포맷팅 분석 실패 — 수동으로 formatting 항목을 추가해주세요");
    }
  }

  return {
    items: [...contentItems, ...formattingItems],
    warnings,
  };
}

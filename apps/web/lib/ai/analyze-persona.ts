/**
 * 페르소나 AI 분석 — 크롤링 데이터 → 2-pass 분석 → persona_items
 *
 * Pass 1: 콘텐츠 분석 (voice, emoji, structure, ending, forbidden, custom)
 * Pass 2: 포맷팅 분석 (formatting — HTML 메타데이터 기반)
 *
 * 모델: Sonnet (1회성 분석, 정확도 우선)
 */
import Anthropic from "@anthropic-ai/sdk";
import type { CrawledPost, CrawlResult, BlockSequenceItem } from "@/lib/crawl/naver-blog";

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

/**
 * 블록 시퀀스를 상세 문자열로 변환.
 * text 블록에 글자 수, image에 캡션, sticker에 팩 ID를 포함.
 * 예: text(130자) → image → text(35자) → sticker[ogq_604a] → separator → ...
 */
function formatBlockSequence(blocks: BlockSequenceItem[]): string {
  if (blocks.length === 0) return "(없음)";
  return blocks.map((b) => {
    if (b.type === "text") {
      if (b.charCount === 0) return "빈줄";
      // 블록별 속성 표시: text(130자,center,nanumbareunhipi,fs16,볼드:"쉐프스키친")
      const parts = [`${b.charCount}자`];
      if (b.align && b.align !== "left") parts.push(b.align);
      if (b.font) parts.push(b.font);
      if (b.fontSize) parts.push(b.fontSize);
      if (b.boldTexts?.length) parts.push(`볼드:"${b.boldTexts[0]}"`);
      return `text(${parts.join(",")})`;
    }
    if (b.type === "image") {
      return b.caption ? `image[캡션:"${b.caption.slice(0, 30)}"]` : "image";
    }
    if (b.type === "sticker") {
      return b.stickerPackId ? `sticker[${b.stickerPackId.slice(0, 12)}]` : "sticker";
    }
    return b.type;
  }).join(" → ");
}

/** 블록 시퀀스 통계 요약 — 1회 순회로 모든 통계 수집 */
function buildBlockStats(meta: CrawledPost["htmlMeta"]): string {
  let textCount = 0;
  let textCharSum = 0;
  let separatorCount = 0;
  let stickerCount = 0;
  let captionCount = 0;
  const stickerPacks = new Set<string>();

  for (const b of meta.block_sequence) {
    if (b.type === "text" && (b.charCount ?? 0) > 0) {
      textCount++;
      textCharSum += b.charCount ?? 0;
    } else if (b.type === "separator") {
      separatorCount++;
    } else if (b.type === "sticker") {
      stickerCount++;
      if (b.stickerPackId) stickerPacks.add(b.stickerPackId);
    } else if (b.type === "image" && b.caption) {
      captionCount++;
    }
  }

  const avgChars = textCount > 0 ? Math.round(textCharSum / textCount) : 0;
  const parts: string[] = [
    `사진 ${meta.image_count}장`,
    `텍스트 ${textCount}블록 (평균 ${avgChars}자)`,
    `빈줄 ${meta.empty_text_blocks}개`,
  ];
  if (separatorCount > 0) parts.push(`구분선 ${separatorCount}개`);
  if (stickerCount > 0) parts.push(`스티커 ${stickerCount}개 (${stickerPacks.size}종)`);
  if (captionCount > 0) parts.push(`캡션 있는 사진 ${captionCount}장`);

  return parts.join(", ");
}

/** 콘텐츠 분석용: 게시물 텍스트 + 상세 블록 배치 시퀀스 요약 */
function buildContentSummary(posts: CrawledPost[]): string {
  return posts
    .map(
      (p, i) =>
        `--- 게시물 ${i + 1} ---\n` +
        `제목: ${p.title}\n` +
        `카테고리: ${p.category || "없음"}\n` +
        `블록 통계: ${buildBlockStats(p.htmlMeta)}\n` +
        `요소 배치: ${formatBlockSequence(p.htmlMeta.block_sequence)}\n` +
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

각 게시물에는 "블록 통계"와 "요소 배치"가 포함되어 있다.
"요소 배치"는 실제 HTML에서 추출한 블록 순서와 상세 정보야:
- text(N자): 텍스트 블록 (N은 글자 수 — 짧으면 1줄, 길면 여러 줄)
- 빈줄: 줄바꿈용 빈 텍스트 블록
- image: 사진 (캡션이 있으면 [캡션:"..."] 표기)
- sticker[ogq_XXX]: 스티커 장식 (같은 팩 ID면 같은 스타일)
- separator: 가로 구분선
- map: 네이버 지도
- oglink: 외부 링크 카드
- video: 동영상
- quotation: 인용구 블록

"블록 통계"는 게시물별 사진 수, 텍스트 평균 글자 수, 스티커 종류 수 등의 요약이야.

카테고리:
- voice: 어미, 말투, 특유의 표현 (예: "~했어요", "~더라구요", "진짜", "완전")
- emoji: 사용하는 이모지와 규칙 (빈도, 위치 — 문장 끝/제목/단독줄)
- structure: **글의 전체 레이아웃 패턴**. "요소 배치" 데이터를 분석하여 아래 항목을 반드시 추출:
  * 글_레이아웃_템플릿 (key: "글_레이아웃_템플릿") — 요소 배치 시퀀스에서 공통으로 나타나는 전체 구조 템플릿
    예: "text(인사) → image → text(2~3줄 감상) → image → text(정보) → sticker(구분) → text(3~4줄) → image → map → text(마무리)"
    모든 요소(text, image, sticker, map, oglink)의 배치를 포함해야 함
  * 사진_배치_패턴 (key: "사진_배치_패턴") — 사진이 언제, 몇 장씩 들어가는지
    예: "text 2~3블록마다 사진 1장", "도입부 사진 1장 → 본문마다 사진 2장 연속"
  * 텍스트_사진_비율 (key: "텍스트_사진_비율") — 텍스트 블록과 사진의 대략적 비율
    예: "text 3 : image 1", "text 2 : image 2 (사진이 많은 스타일)"
  * 텍스트_블록_길이 (key: "텍스트_블록_길이") — 각 텍스트 블록이 보통 몇 자인지
    예: "평균 40~60자 (짧은 1~2줄 감상)", "평균 100~150자 (긴 설명문)"
  * 스티커_사용 (key: "스티커_사용") — 스티커를 쓰는지, 어디에 쓰는지, 같은 팩인지
    예: "섹션 사이에 sticker 1개씩 (같은 ogq팩 반복)", "미사용"
  * 구분선_사용 (key: "구분선_사용") — separator(가로줄)를 쓰는지, 어디에 쓰는지
    예: "도입부 끝 + 본문 끝에 separator", "미사용"
  * 지도_배치 (key: "지도_배치") — 지도를 쓰는지, 어디에 배치하는지
    예: "글 마지막에 map 1개 (장소 정보)", "미사용"
  * 외부링크_배치 (key: "외부링크_배치") — oglink를 쓰는지, 어디에 배치하는지
    예: "글 끝 참고 링크로 oglink 1개", "미사용"
  * 오프닝_방식 (key: "오프닝_방식") — 첫 문장/문단의 시작 패턴
    예: "인사 + 장소 소개로 시작", "사진 먼저 → 감상 텍스트"
  * 섹션_구분 (key: "섹션_구분") — 섹션을 어떻게 나누는지
    예: "sticker로 섹션 구분", "separator로 구분", "빈 줄로 구분"
  * 사진_캡션 (key: "사진_캡션") — 사진에 캡션을 다는지, 스타일은 어떤지
    예: "캡션 없음", "사진 아래 짧은 감탄형 캡션"
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
    max_tokens: 6000,
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

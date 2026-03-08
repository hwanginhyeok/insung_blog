/**
 * 피드백 패턴 분석 — 누적된 재생성 피드백에서 공통 규칙 도출
 *
 * 5건 이상의 피드백을 모아 AI에게 패턴 분석 요청.
 * 도출된 규칙은 사용자 승인 후 persona_items에 반영.
 *
 * 모델: Haiku (반복 분석, 비용 효율 우선)
 */
import Anthropic from "@anthropic-ai/sdk";

const FEEDBACK_MODEL = "claude-haiku-4-5-20251001";

// ── 타입 ──

export interface DerivedRule {
  category: string;
  key: string;
  value: string;
}

// ── JSON 파싱 ──

function parseRules(raw: string): DerivedRule[] {
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
    }>;

    return items
      .filter(
        (item) =>
          item.category &&
          validCategories.has(item.category) &&
          item.key &&
          item.value
      )
      .map((item) => ({
        category: item.category!,
        key: item.key!,
        value: item.value!,
      }));
  } catch (e) {
    console.error("피드백 규칙 JSON 파싱 실패:", e);
    return [];
  }
}

// ── 메인 ──

/**
 * 피드백 텍스트 배열 → AI 분석 → 공통 패턴 규칙 도출
 *
 * 5건 이상의 피드백에서 반복 등장하는 요청 패턴을 페르소나 규칙으로 변환.
 * 최대 3개 규칙 반환.
 */
export async function analyzeFeedbackPatterns(
  feedbackTexts: string[]
): Promise<DerivedRule[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다");
  }

  const client = new Anthropic({ apiKey });

  const feedbackList = feedbackTexts
    .map((text, i) => `${i + 1}. "${text}"`)
    .join("\n");

  const systemPrompt = `너는 블로그 글쓰기 피드백 분석 전문가야.
사용자가 AI 초안에 대해 남긴 수정 요청(피드백)들에서 **반복되는 공통 패턴**을 찾아.
1~3개의 구체적인 글쓰기 규칙으로 변환해.

카테고리:
- voice: 어미, 말투, 표현 관련
- emoji: 이모지 사용 관련
- structure: 글 구조, 문단, 길이 관련
- ending: 마무리 패턴 관련
- forbidden: 쓰지 말아야 할 표현
- custom: 기타 독특한 패턴
- formatting: 폰트, 볼드, 정렬 등 시각적 서식

규칙:
- 단 1회만 언급된 요청은 무시 (반복 패턴만 추출)
- 너무 일반적인 규칙 금지 (예: "좋은 글을 써라")
- 구체적이고 실행 가능한 규칙만 (예: "문장 길이를 30자 이내로")
- 패턴이 없으면 빈 배열 [] 반환

출력 형식: JSON 배열만 출력. 다른 텍스트 절대 금지.
[
  { "category": "카테고리", "key": "규칙 요약", "value": "구체적 설명" }
]`;

  const response = await client.messages.create({
    model: FEEDBACK_MODEL,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `아래 ${feedbackTexts.length}건의 피드백에서 공통 패턴을 추출해줘.\n\n${feedbackList}`,
      },
      { role: "assistant", content: "[" },
    ],
  });

  const raw =
    "[" +
    (response.content[0].type === "text"
      ? response.content[0].text.trim()
      : "");

  const rules = parseRules(raw);

  // 최대 3개 규칙
  return rules.slice(0, 3);
}

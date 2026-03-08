/**
 * 네이버 SmartEditor 호환 HTML 렌더러
 *
 * 역할: AI 텍스트 출력 → HTML → ClipboardItem 복사 → SmartEditor 붙여넣기
 *
 * 핵심 전략:
 *  - <span class="se-ff-* se-fs-*"> 클래스 + 인라인 CSS 병행 (SmartEditor 인식률 극대화)
 *  - SmartEditor가 인식하는 font-family/size 매핑
 *  - 빈 <p> 로 줄 간격 구현 (SmartEditor의 빈 텍스트 블록과 동일)
 *  - **text** 마크다운 → <b> 태그
 *  - [PHOTO_N] 마커 → <img> 태그
 */

/** DB persona_items 행 (is_active 포함) */
export interface FormattingItem {
  category: string;
  key: string;
  value: string;
  priority: number;
  is_active: boolean;
}

// ── SmartEditor 폰트 매핑 ──

/** se-ff-{key} → CSS font-family (따옴표 없이 — SmartEditor paste 호환) */
const FONT_MAP: Record<string, string> = {
  nanumbareunhipi: "NanumBarunhipi, 나눔바른히피, sans-serif",
  nanumgothic: "NanumGothic, 나눔고딕, sans-serif",
  nanummyeongjo: "NanumMyeongjo, 나눔명조, serif",
  nanumbarunpenscript: "NanumBarunpenScript, 나눔바른펜, cursive",
  nanumpenscript: "NanumPenScript, 나눔손글씨 펜, cursive",
  maruburig: "MaruBuri, 마루 부리, serif",
  ridibatang: "RIDIBatang, 리디바탕, serif",
  "noto-sans": "Noto Sans KR, Noto Sans, sans-serif",
};

/** se-fs-{key} → CSS font-size (px) */
const SIZE_MAP: Record<string, string> = {
  fs11: "11px",
  fs13: "13px",
  fs15: "15px",
  fs16: "16px",
  fs18: "18px",
  fs19: "19px",
  fs24: "24px",
  fs28: "28px",
  fs34: "34px",
};

// ── 타입 ──

export interface RenderConfig {
  /** CSS font-family */
  fontFamily: string;
  /** CSS font-size (예: "16px") */
  fontSize: string;
  /** 제목 font-size (예: "24px") */
  titleSize: string;
  /** SmartEditor 폰트 클래스 (예: "se-ff-nanumbareunhipi") */
  fontClass: string;
  /** SmartEditor 본문 크기 클래스 (예: "se-fs-fs16") */
  sizeClass: string;
  /** SmartEditor 제목 크기 클래스 (예: "se-fs-fs24") */
  titleSizeClass: string;
  /** 문단 간 빈 줄 수 (기본 1) */
  lineSpacing: number;
  /** 볼드 관련 AI 설명 (참고용, 렌더러는 **마크다운** 기반 처리) */
  boldUsage: string;
  /** 정렬 관련 AI 설명 (참고용) */
  alignmentUsage: string;
}

// ── 기본값 ──

const DEFAULT_CONFIG: RenderConfig = {
  fontFamily: "NanumBarunhipi, 나눔바른히피, sans-serif",
  fontSize: "16px",
  titleSize: "24px",
  fontClass: "se-ff-nanumbareunhipi",
  sizeClass: "se-fs-fs16",
  titleSizeClass: "se-fs-fs24",
  lineSpacing: 1,
  boldUsage: "",
  alignmentUsage: "",
};

// ── RenderConfig 빌더 ──

/**
 * formatting 카테고리 persona_items → RenderConfig 변환
 */
export function buildRenderConfig(
  items: FormattingItem[]
): RenderConfig {
  const config = { ...DEFAULT_CONFIG };

  for (const item of items) {
    if (item.category !== "formatting" || !item.is_active) continue;

    switch (item.key) {
      case "primary_font":
        config.fontFamily =
          FONT_MAP[item.value] || `${item.value}, sans-serif`;
        config.fontClass = `se-ff-${item.value}`;
        break;
      case "primary_size":
        config.fontSize = SIZE_MAP[item.value] || "16px";
        config.sizeClass = `se-fs-${item.value}`;
        break;
      case "title_size":
        config.titleSize = SIZE_MAP[item.value] || "24px";
        config.titleSizeClass = `se-fs-${item.value}`;
        break;
      case "line_spacing": {
        const match = item.value.match(/(\d+)/);
        if (match) config.lineSpacing = parseInt(match[1]);
        break;
      }
      case "bold_usage":
        config.boldUsage = item.value;
        break;
      case "alignment":
        config.alignmentUsage = item.value;
        break;
    }
  }

  return config;
}

// ── HTML 블록 생성 유틸 ──

/** HTML 특수문자 이스케이프 (볼드 마커 제외) */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 텍스트 처리: 이스케이프 → 볼드 변환 */
function processText(text: string): string {
  // **볼드** 마커를 임시 치환 후 이스케이프, 다시 복원
  const BOLD_PLACEHOLDER = "\x00BOLD\x01";
  const bolds: string[] = [];

  const withPlaceholders = text.replace(/\*\*(.+?)\*\*/g, (_, content) => {
    bolds.push(content);
    return BOLD_PLACEHOLDER;
  });

  let escaped = escapeHtml(withPlaceholders);

  // 볼드 복원
  let idx = 0;
  escaped = escaped.replace(
    new RegExp(escapeHtml(BOLD_PLACEHOLDER), "g"),
    () => `<b>${escapeHtml(bolds[idx++])}</b>`
  );

  return escaped;
}

/**
 * SmartEditor ONE 내부 텍스트 컴포넌트 구조를 복제한 텍스트 블록.
 *
 * SmartEditor 에디터 영역의 실제 DOM:
 *   <div class="se-component se-text …">
 *     <div class="se-component-content">
 *       <div class="se-section se-section-text">
 *         <div class="se-module se-module-text">
 *           <p class="se-text-paragraph se-text-paragraph-align-left">
 *             <span class="se-ff-* se-fs-*">텍스트</span>
 *           </p>
 *         </div>
 *       </div>
 *     </div>
 *   </div>
 *
 * paste handler가 이 구조를 "자기 것"으로 인식하여 스타일을 보존한다.
 */
function makeTextBlock(
  text: string,
  config: RenderConfig,
  opts?: { align?: "center" | "left"; size?: string; sizeClass?: string; bold?: boolean }
): string {
  const align = opts?.align || "left";
  const size = opts?.size || config.fontSize;
  const sizeClass = opts?.sizeClass || config.sizeClass;
  const spanClass = `${config.fontClass} ${sizeClass}`;
  const spanStyle = `font-family: ${config.fontFamily}; font-size: ${size};`;

  let content = processText(text);
  if (opts?.bold) content = `<b>${content}</b>`;

  return [
    `<div class="se-component se-text">`,
    `<div class="se-component-content">`,
    `<div class="se-section se-section-text">`,
    `<div class="se-module se-module-text">`,
    `<p class="se-text-paragraph se-text-paragraph-align-${align}" style="line-height: 1.8;">`,
    `<span class="${spanClass}" style="${spanStyle}">${content}</span>`,
    `</p>`,
    `</div></div></div></div>`,
  ].join("");
}

/** 빈 줄 (줄 간격 역할) — SmartEditor 내부 구조 + 제로폭스페이스 */
function makeEmptyBlock(config: RenderConfig): string {
  const spanClass = `${config.fontClass} ${config.sizeClass}`;
  const spanStyle = `font-family: ${config.fontFamily}; font-size: ${config.fontSize};`;
  return [
    `<div class="se-component se-text">`,
    `<div class="se-component-content">`,
    `<div class="se-section se-section-text">`,
    `<div class="se-module se-module-text">`,
    `<p class="se-text-paragraph se-text-paragraph-align-left" style="line-height: 1.8;">`,
    `<span class="${spanClass}" style="${spanStyle}">&#8203;</span>`,
    `</p>`,
    `</div></div></div></div>`,
  ].join("");
}

/** 이미지 블록 — SmartEditor 이미지 컴포넌트 구조 */
function makeImageBlock(url: string): string {
  return [
    `<div class="se-component se-image">`,
    `<div class="se-component-content">`,
    `<div class="se-section se-section-image">`,
    `<div class="se-module se-module-image">`,
    `<a class="se-module-image-link">`,
    `<img src="${url}" class="se-image-resource" style="max-width: 100%;">`,
    `</a>`,
    `</div></div></div></div>`,
  ].join("");
}

// ── 메인 렌더러 ──

/**
 * AI 텍스트 → SmartEditor 호환 HTML
 *
 * 본문 규약:
 *  - \n = 줄바꿈 (같은 문단 내 또는 새 문단)
 *  - \n\n = 문단 구분 (빈 줄 삽입)
 *  - [PHOTO_N] = 사진 마커 (단독 줄)
 *  - **텍스트** = 볼드
 *
 * @param title 제목
 * @param body 본문 (마커 포함)
 * @param photoUrls Storage URL 배열 (인덱스 = PHOTO_N - 1)
 * @param config RenderConfig (buildRenderConfig으로 생성)
 */
export function renderToNaverHtml(
  title: string,
  body: string,
  photoUrls: string[],
  config: RenderConfig = DEFAULT_CONFIG
): string {
  const blocks: string[] = [];

  // 제목 블록
  blocks.push(makeTextBlock(title, config, {
    bold: true,
    size: config.titleSize,
    sizeClass: config.titleSizeClass,
  }));
  blocks.push(makeEmptyBlock(config));

  // 본문 처리
  const paragraphs = body.split(/\n\n+/); // 문단 분리

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const paragraph = paragraphs[pi];
    const lines = paragraph.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // [PHOTO_N] 마커 → 이미지
      const photoMatch = trimmed.match(/^\[PHOTO_(\d+)\]$/);
      if (photoMatch) {
        const idx = parseInt(photoMatch[1]) - 1;
        if (photoUrls[idx]) {
          blocks.push(makeEmptyBlock(config));
          blocks.push(makeImageBlock(photoUrls[idx]));
          blocks.push(makeEmptyBlock(config));
        }
        continue;
      }

      // 일반 텍스트
      blocks.push(makeTextBlock(trimmed, config));
    }

    // 문단 간 줄 간격
    if (pi < paragraphs.length - 1) {
      for (let s = 0; s < config.lineSpacing; s++) {
        blocks.push(makeEmptyBlock(config));
      }
    }
  }

  return blocks.join("\n");
}

/**
 * DB에서 가져온 persona_items 중 formatting 항목 → RenderConfig → HTML
 * (편의 함수)
 */
export function renderPostHtml(
  title: string,
  body: string,
  photoUrls: string[],
  formattingItems: FormattingItem[]
): string {
  const config = buildRenderConfig(formattingItems);
  return renderToNaverHtml(title, body, photoUrls, config);
}

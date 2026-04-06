/**
 * 네이버 블로그 크롤링 — cheerio 기반 (서버리스 호환)
 *
 * 파이프라인:
 *  1. blogUrl에서 blogId 추출
 *  2. PostTitleListAsync AJAX API로 게시물 logNo 목록 수집
 *  3. m.blog.naver.com/{blogId}/{logNo} 개별 fetch
 *  4. cheerio로 텍스트 + HTML 메타데이터 추출
 */
import * as cheerio from "cheerio";
import type { Element } from "domhandler";

// ── 상수 ──

const AJAX_LIST_URL =
  "https://blog.naver.com/PostTitleListAsync.naver" +
  "?blogId={blogId}&viewdate=&currentPage={page}" +
  "&categoryNo=0&parentCategoryNo=0&countPerPage=30";

const MOBILE_POST_URL = "https://m.blog.naver.com/{blogId}/{logNo}";

const MAX_POSTS = 20;
const FETCH_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 10_000;

// ── 타입 ──

/** 블록 시퀀스 항목: 타입 + 블록별 부가 정보 */
export interface BlockSequenceItem {
  type: string;
  /** text 블록: 글자 수 (빈 줄이면 0) */
  charCount?: number;
  /** text 블록: 정렬 (left/center/right) */
  align?: string;
  /** text 블록: 폰트 클래스 (se-ff-* 에서 접두사 제거) */
  font?: string;
  /** text 블록: 크기 클래스 (se-fs-* 에서 접두사 제거) */
  fontSize?: string;
  /** text 블록: 볼드 텍스트 목록 (최대 3개) */
  boldTexts?: string[];
  /** image 블록: 캡션 텍스트 (없으면 undefined) */
  caption?: string;
  /** sticker 블록: 스티커팩 ID (ogq_XXXXX 형태) */
  stickerPackId?: string;
}

export interface HtmlMetadata {
  /** 블록 시퀀스: 글의 뼈대 (타입 + 부가 정보) */
  block_sequence: BlockSequenceItem[];
  /** se-ff-* 폰트 클래스 빈도 */
  font_classes: Record<string, number>;
  /** se-fs-* 사이즈 클래스 빈도 */
  size_classes: Record<string, number>;
  /** 좌측정렬 텍스트 블록 수 */
  align_left: number;
  /** 중앙정렬 텍스트 블록 수 */
  align_center: number;
  /** 중앙정렬된 텍스트 샘플 (최대 5개) */
  center_texts: string[];
  /** <b>, <strong> 안의 텍스트 샘플 (최대 10개) */
  bold_texts: string[];
  /** 빈 텍스트 블록 수 (줄 간격 역할) */
  empty_text_blocks: number;
  /** 전체 텍스트 블록 수 */
  total_text_blocks: number;
  /** 색상이 적용된 span 샘플 */
  color_spans: { color: string; text: string }[];
  /** 게시물 내 이미지 총 개수 */
  image_count: number;
  /** 빈 텍스트 블록의 시퀀스 내 인덱스 목록 */
  empty_line_positions: number[];
}

export interface CrawledPost {
  url: string;
  title: string;
  body: string;
  category: string;
  body_length: number;
  htmlMeta: HtmlMetadata;
}

export interface CrawlResult {
  blogId: string;
  posts: CrawledPost[];
  fontSummary: {
    font_classes: Record<string, number>;
    size_classes: Record<string, number>;
    primary_font: string;
    primary_size: string;
  };
}

// ── 유틸 ──

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 블로그 URL에서 blogId 추출
 * 지원: blog.naver.com/{id}, m.blog.naver.com/{id}, blog.naver.com/PostList.naver?blogId={id}
 */
export function extractBlogId(url: string): string | null {
  // blog.naver.com/{blogId} 패턴
  const pathMatch = url.match(
    /(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_]+)/
  );
  if (pathMatch && pathMatch[1] !== "PostList.naver") {
    return pathMatch[1];
  }

  // blogId=xxx 쿼리 파라미터
  const paramMatch = url.match(/blogId=([a-zA-Z0-9_]+)/);
  if (paramMatch) return paramMatch[1];

  // blogId만 직접 입력한 경우 (URL이 아닌 경우)
  if (/^[a-zA-Z0-9_]+$/.test(url.trim())) {
    return url.trim();
  }

  return null;
}

// ── 1단계: 게시물 목록 수집 ──

/**
 * AJAX API로 게시물 logNo 목록 수집
 */
async function collectPostIds(
  blogId: string,
  maxPosts = MAX_POSTS
): Promise<string[]> {
  const logNos: string[] = [];
  const seen = new Set<string>();
  let page = 1;
  const maxPages = Math.ceil(maxPosts / 30) + 1;

  while (logNos.length < maxPosts && page <= maxPages) {
    const url = AJAX_LIST_URL
      .replace("{blogId}", blogId)
      .replace("{page}", String(page));

    try {
      const res = await fetchWithTimeout(url);
      const rawText = await res.text();

      // 네이버 비표준 JSON 이스케이프 수정
      const fixed = rawText.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
      const data = JSON.parse(fixed);

      const postList = data.postList || [];
      if (postList.length === 0) break;

      for (const post of postList) {
        const logNo = post.logNo || "";
        if (logNo && !seen.has(logNo)) {
          seen.add(logNo);
          logNos.push(logNo);
          if (logNos.length >= maxPosts) break;
        }
      }
    } catch (e) {
      console.warn(`AJAX 페이지 ${page} 파싱 실패:`, e);
      break;
    }

    page++;
    await sleep(FETCH_DELAY_MS);
  }

  return logNos;
}

// ── 2단계: 개별 게시물 HTML 추출 ──

/**
 * 모바일 게시물 페이지에서 텍스트 + HTML 메타데이터 추출
 */
async function extractPost(
  blogId: string,
  logNo: string
): Promise<CrawledPost | null> {
  const url = MOBILE_POST_URL
    .replace("{blogId}", blogId)
    .replace("{logNo}", logNo);

  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // 제목 추출
    const title =
      $(".se-title-text").text().trim() ||
      $(".post_title").text().trim() ||
      $("h3.se_textarea").text().trim() ||
      "";

    // 카테고리 추출
    const category =
      $(".blog2_series").text().trim() ||
      $(".post_category").text().trim() ||
      $("a[href*='categoryNo']").first().text().trim() ||
      "";

    // 본문 컨테이너
    const mainContainer =
      $(".se-main-container").length > 0
        ? $(".se-main-container")
        : $(".post-view");

    if (!mainContainer.length && !title) return null;

    // 본문 텍스트 추출 (3000자 제한)
    const bodyText = mainContainer.text().trim().slice(0, 3000);

    // HTML 메타데이터 추출
    const htmlMeta = extractHtmlMetadata($, mainContainer);

    return {
      url,
      title,
      body: bodyText,
      category,
      body_length: bodyText.length,
      htmlMeta,
    };
  } catch (e) {
    console.warn(`게시물 추출 실패 (${logNo}):`, e);
    return null;
  }
}

/**
 * SmartEditor HTML 구조에서 포맷팅 메타데이터 추출
 */
function extractHtmlMetadata(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<Element>
): HtmlMetadata {
  const meta: HtmlMetadata = {
    block_sequence: [],
    font_classes: {},
    size_classes: {},
    align_left: 0,
    align_center: 0,
    center_texts: [],
    bold_texts: [],
    empty_text_blocks: 0,
    total_text_blocks: 0,
    color_spans: [],
    image_count: 0,
    empty_line_positions: [],
  };

  // 블록 시퀀스 + 폰트/사이즈 + 정렬 + 빈 줄 분석
  let blockIndex = 0;
  container.find(".se-component").each((_, el) => {
    const $el = $(el);
    const classes = ($el.attr("class") || "").split(/\s+/);

    // 블록 타입 판별 (구분선, 인용구 추가)
    let blockType = "unknown";
    for (const cls of classes) {
      if (cls === "se-text") blockType = "text";
      else if (cls === "se-image") blockType = "image";
      else if (cls === "se-oglink") blockType = "oglink";
      else if (cls === "se-map") blockType = "map";
      else if (cls === "se-video") blockType = "video";
      else if (cls === "se-sticker") blockType = "sticker";
      else if (cls === "se-otype") blockType = "otype";
      else if (cls === "se-horizontalLine") blockType = "separator";
      else if (cls === "se-quotation") blockType = "quotation";
    }

    const block: BlockSequenceItem = { type: blockType };

    // 텍스트 블록 상세 분석
    if (blockType === "text") {
      meta.total_text_blocks++;

      const textContent = $el.text().trim();
      const charCount = textContent.length;
      const isEmpty = !textContent || textContent === "\u200B";
      block.charCount = isEmpty ? 0 : charCount;

      if (isEmpty) {
        meta.empty_text_blocks++;
        meta.empty_line_positions.push(blockIndex);
      }

      // 블록별 정렬 (첫 번째 paragraph 기준)
      const firstParagraph = $el.find(".se-text-paragraph").first();
      const pCls = (firstParagraph.attr("class") || "");
      if (pCls.includes("align-center")) block.align = "center";
      else if (pCls.includes("align-right")) block.align = "right";
      else block.align = "left";

      // 블록별 폰트/크기 (첫 번째 span 기준 — 대표값)
      const firstSpan = $el.find("[class*='se-ff-'], [class*='se-fs-']").first();
      if (firstSpan.length) {
        const spanCls = (firstSpan.attr("class") || "").split(/\s+/);
        for (const c of spanCls) {
          if (c.startsWith("se-ff-") && !block.font) {
            const f = c.replace("se-ff-", "");
            if (f) block.font = f;
          }
          if (c.startsWith("se-fs-") && !block.fontSize) {
            block.fontSize = c.replace("se-fs-", "");
          }
        }
      }

      // 블록별 볼드 텍스트 (최대 3개)
      const boldTexts: string[] = [];
      $el.find("b, strong").each((_, b) => {
        const t = $(b).text().trim();
        if (t && boldTexts.length < 3) boldTexts.push(t.slice(0, 30));
      });
      if (boldTexts.length > 0) block.boldTexts = boldTexts;

      // 정렬 통계 (기존 집계 유지)
      $el.find(".se-text-paragraph").each((_, p) => {
        const pClasses = ($(p).attr("class") || "").split(/\s+/);
        if (pClasses.some((c) => c.includes("align-center"))) {
          meta.align_center++;
          const centerText = $(p).text().trim();
          if (centerText && meta.center_texts.length < 5) {
            meta.center_texts.push(centerText.slice(0, 50));
          }
        } else {
          meta.align_left++;
        }
      });

      // 폰트/사이즈 클래스 통계 (기존 집계 유지)
      $el.find("[class*='se-ff-'], [class*='se-fs-']").each((_, span) => {
        const spanClasses = ($(span).attr("class") || "").split(/\s+/);
        for (const cls of spanClasses) {
          if (cls.startsWith("se-ff-")) {
            const font = cls.replace("se-ff-", "");
            meta.font_classes[font] = (meta.font_classes[font] || 0) + 1;
          }
          if (cls.startsWith("se-fs-")) {
            const size = cls.replace("se-fs-", "");
            meta.size_classes[size] = (meta.size_classes[size] || 0) + 1;
          }
        }
      });
    }

    // 이미지 블록: 캡션 추출 + 개수 집계
    if (blockType === "image") {
      meta.image_count++;
      const captionEl = $el.find(".se-caption");
      const caption = captionEl.text().trim();
      if (caption) {
        block.caption = caption.slice(0, 100);
      }
    }

    // 스티커 블록: 팩 ID 추출
    if (blockType === "sticker") {
      const img = $el.find("img");
      const src = img.attr("src") || img.attr("data-src") || "";
      const packMatch = src.match(/\/(ogq_[a-f0-9]+)\//);
      if (packMatch) {
        block.stickerPackId = packMatch[1];
      }
    }

    meta.block_sequence.push(block);
    blockIndex++;
  });

  // 볼드 텍스트 추출
  container.find("b, strong").each((_, el) => {
    const text = $(el).text().trim();
    if (text && meta.bold_texts.length < 10) {
      meta.bold_texts.push(text.slice(0, 50));
    }
  });

  // 색상 span 추출
  container.find("[style*='color']").each((_, el) => {
    const style = $(el).attr("style") || "";
    const colorMatch = style.match(/color\s*:\s*([^;]+)/);
    const text = $(el).text().trim();
    if (colorMatch && text && meta.color_spans.length < 5) {
      meta.color_spans.push({
        color: colorMatch[1].trim(),
        text: text.slice(0, 50),
      });
    }
  });

  return meta;
}

// ── 게시물 성과 지표 추출 ──

export interface PostMetrics {
  viewCount: number;
  commentCount: number;
  likeCount: number;
  title: string;
}

/**
 * 모바일 게시물 페이지에서 조회수/댓글수/좋아요 추출
 * 셀렉터 폴백 체인으로 네이버 DOM 변경에 대비
 */
export async function extractPostMetrics(
  blogId: string,
  logNo: string
): Promise<PostMetrics> {
  const url = MOBILE_POST_URL
    .replace("{blogId}", blogId)
    .replace("{logNo}", logNo);

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // 제목
  const title =
    $(".se-title-text").text().trim() ||
    $(".post_title").text().trim() ||
    $("h3.se_textarea").text().trim() ||
    "";

  // 조회수 (셀렉터 폴백 체인)
  const viewText =
    $(".se_count_num").text().trim() ||
    $(".post_count .num").text().trim() ||
    $(".cnt_view").text().trim() ||
    $("[class*='view'] [class*='num']").first().text().trim() ||
    "";
  const viewCount = parseInt(viewText.replace(/,/g, ""), 10) || 0;

  // 댓글수
  const commentText =
    $(".comment_count").text().trim() ||
    $(".post_comment_count .num").text().trim() ||
    $("[class*='comment'] [class*='num']").first().text().trim() ||
    "";
  const commentCount = parseInt(commentText.replace(/,/g, ""), 10) || 0;

  // 좋아요
  const likeText =
    $(".u_cnt._count").text().trim() ||
    $(".like_count").text().trim() ||
    $("[class*='sympathy'] [class*='num']").first().text().trim() ||
    "";
  const likeCount = parseInt(likeText.replace(/,/g, ""), 10) || 0;

  return { viewCount, commentCount, likeCount, title };
}

/**
 * 블로그 URL에서 blogId + logNo 추출
 * 지원: m.blog.naver.com/{blogId}/{logNo}, blog.naver.com/{blogId}/{logNo}
 */
export function extractBlogIdAndLogNo(
  url: string
): { blogId: string; logNo: string } | null {
  const match = url.match(
    /(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_]+)\/(\d+)/
  );
  if (match) return { blogId: match[1], logNo: match[2] };
  return null;
}

// ── 3단계: 전체 크롤링 ──

/**
 * 블로그 크롤링 메인 함수
 * @param blogId 네이버 블로그 ID
 * @param maxPosts 최대 수집 게시물 수 (기본 20)
 * @param onProgress 진행률 콜백 (0~1)
 */
export async function crawlBlog(
  blogId: string,
  maxPosts = MAX_POSTS,
  onProgress?: (ratio: number, message: string) => void
): Promise<CrawlResult> {
  // 1. 게시물 목록 수집
  onProgress?.(0.1, "게시물 목록 수집 중...");
  const logNos = await collectPostIds(blogId, maxPosts);

  if (logNos.length === 0) {
    throw new Error("게시물을 찾지 못했습니다. 블로그 ID를 확인해주세요.");
  }

  // 2. 개별 게시물 추출
  const posts: CrawledPost[] = [];
  for (let i = 0; i < logNos.length; i++) {
    onProgress?.(
      0.1 + (i / logNos.length) * 0.8,
      `게시물 분석 중... (${i + 1}/${logNos.length})`
    );

    const post = await extractPost(blogId, logNos[i]);
    if (post) posts.push(post);

    await sleep(FETCH_DELAY_MS);
  }

  if (posts.length === 0) {
    throw new Error("게시물 내용을 추출하지 못했습니다.");
  }

  onProgress?.(0.9, "통계 집계 중...");

  // 3. 폰트 통계 집계
  const allFonts: Record<string, number> = {};
  const allSizes: Record<string, number> = {};

  for (const post of posts) {
    for (const [font, count] of Object.entries(post.htmlMeta.font_classes)) {
      allFonts[font] = (allFonts[font] || 0) + count;
    }
    for (const [size, count] of Object.entries(post.htmlMeta.size_classes)) {
      allSizes[size] = (allSizes[size] || 0) + count;
    }
  }

  // 빈도순 정렬
  const sortedFonts = Object.fromEntries(
    Object.entries(allFonts).sort(([, a], [, b]) => b - a)
  );
  const sortedSizes = Object.fromEntries(
    Object.entries(allSizes).sort(([, a], [, b]) => b - a)
  );

  onProgress?.(1.0, "크롤링 완료");

  return {
    blogId,
    posts,
    fontSummary: {
      font_classes: sortedFonts,
      size_classes: sortedSizes,
      primary_font: Object.keys(sortedFonts)[0] || "",
      primary_size: Object.keys(sortedSizes)[0] || "",
    },
  };
}

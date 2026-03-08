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

export interface HtmlMetadata {
  /** 블록 시퀀스: 글의 뼈대 */
  block_sequence: { type: string }[];
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
  };

  // 블록 시퀀스 + 폰트/사이즈 + 정렬 + 빈 줄 분석
  container.find(".se-component").each((_, el) => {
    const $el = $(el);
    const classes = ($el.attr("class") || "").split(/\s+/);

    // 블록 타입 판별
    let blockType = "unknown";
    for (const cls of classes) {
      if (cls === "se-text") blockType = "text";
      else if (cls === "se-image") blockType = "image";
      else if (cls === "se-oglink") blockType = "oglink";
      else if (cls === "se-map") blockType = "map";
      else if (cls === "se-video") blockType = "video";
      else if (cls === "se-sticker") blockType = "sticker";
      else if (cls === "se-otype") blockType = "otype";
    }

    meta.block_sequence.push({ type: blockType });

    // 텍스트 블록 상세 분석
    if (blockType === "text") {
      meta.total_text_blocks++;

      const textContent = $el.text().trim();
      // 빈 텍스트 블록 (줄 간격 역할) — 제로폭스페이스(​) 또는 빈 문자열
      if (!textContent || textContent === "\u200B") {
        meta.empty_text_blocks++;
      }

      // 정렬 분석
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

      // 폰트/사이즈 클래스 분석
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

"""
블로그 스타일 크롤링 스크립트 — Playwright로 타겟 블로그 게시물 수집

사용법:
  source .venv/bin/activate
  python scripts/analyze_blog_style.py                     # 기본 30개
  python scripts/analyze_blog_style.py --max-posts 5       # 5개만
  python scripts/analyze_blog_style.py --blog-id OTHER_ID  # 다른 블로그

수집 항목:
  - 게시물 제목, 본문 텍스트, 카테고리
  - 폰트 정보 (SmartEditor se-ff-*, se-fs-* 클래스 + computed style)

출력:
  skills/blog_analysis/raw_posts.json
"""
import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

from config.settings import PAGE_LOAD_TIMEOUT, PROJECT_ROOT
from src.utils.logger import logger

# 출력 경로
OUTPUT_DIR = PROJECT_ROOT / "skills" / "blog_analysis"
OUTPUT_PATH = OUTPUT_DIR / "raw_posts.json"

# 크롤링 설정
DEFAULT_BLOG_ID = "youyoubear0517"
DEFAULT_MAX_POSTS = 30
AJAX_LIST_URL = (
    "https://blog.naver.com/PostTitleListAsync.naver"
    "?blogId={blog_id}&viewdate=&currentPage={page}"
    "&categoryNo=0&parentCategoryNo=0&countPerPage=30"
)
POST_URL = "https://blog.naver.com/{blog_id}/{log_no}"

# 네이버 JSON의 비표준 이스케이프 수정 패턴
_BAD_ESCAPE = re.compile(r'\\(?!["\\/bfnrtu])')

# 게시물 번호 추출 패턴 (폴백용)
_LOGNO_PATTERN = re.compile(r"logNo=(\d+)|/(\d{12,})")


async def _collect_post_urls(page, blog_id: str, max_posts: int) -> list[str]:
    """AJAX API(PostTitleListAsync)로 게시물 logNo를 수집하여 URL 리스트 반환"""
    collected: list[str] = []
    seen: set[str] = set()
    current_page = 1
    max_pages = (max_posts // 30) + 3

    while len(collected) < max_posts and current_page <= max_pages:
        ajax_url = AJAX_LIST_URL.format(blog_id=blog_id, page=current_page)
        logger.info(f"AJAX 페이지 {current_page} 요청")

        await page.goto(ajax_url, timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(1.5)

        # JSON 파싱 (네이버 비표준 이스케이프 수정)
        raw_text = await page.evaluate(
            "() => document.querySelector('pre')?.textContent || document.body.innerText"
        )
        fixed_text = _BAD_ESCAPE.sub(r"\\\\", raw_text)
        try:
            data = json.loads(fixed_text)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON 파싱 실패 (페이지 {current_page}): {e}")
            break

        post_list = data.get("postList", [])
        if not post_list:
            logger.info(f"  → 페이지 {current_page}: 빈 응답 — 수집 종료")
            break

        new_count = 0
        for post in post_list:
            log_no = post.get("logNo", "")
            if log_no and log_no not in seen:
                seen.add(log_no)
                collected.append(POST_URL.format(blog_id=blog_id, log_no=log_no))
                new_count += 1
                if len(collected) >= max_posts:
                    break

        total_count = data.get("totalCount", "?")
        logger.info(
            f"  → 페이지 {current_page}: {new_count}개 수집 "
            f"(누적 {len(collected)}/{total_count})"
        )

        current_page += 1

    logger.info(f"게시물 URL 총 {len(collected)}개 수집 완료")
    return collected[:max_posts]


async def _extract_post_data(page, url: str) -> dict | None:
    """개별 게시물 페이지에서 데이터 추출"""
    try:
        await page.goto(url, timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT)
        await asyncio.sleep(2)

        # mainFrame iframe 탐색
        frame = page.frame("mainFrame") or page

        # 카테고리 추출
        category = ""
        cat_selectors = [
            ".blog2_series",
            ".categori a",
            ".category a",
            "a[href*='categoryNo']",
            ".se-viewer-category",
        ]
        for sel in cat_selectors:
            try:
                el = await frame.query_selector(sel)
                if el:
                    category = (await el.inner_text()).strip()
                    if category:
                        break
            except Exception:
                continue

        # 제목 추출
        title = ""
        title_selectors = [
            ".se-title-text",
            ".pcol1",
            ".itemSubjectBoldfont",
            ".se_title",
            "h3.se_textarea",
        ]
        for sel in title_selectors:
            try:
                el = await frame.query_selector(sel)
                if el:
                    title = (await el.inner_text()).strip()
                    if title:
                        break
            except Exception:
                continue

        # 본문 추출
        body = ""
        body_selectors = [
            ".se-main-container",
            ".se_component_wrap",
            "#postViewArea",
            "#content-area",
        ]
        for sel in body_selectors:
            try:
                el = await frame.query_selector(sel)
                if el:
                    body = (await el.inner_text()).strip()
                    if body:
                        break
            except Exception:
                continue

        # 폰트 정보 추출 — SmartEditor CSS 클래스
        font_info = await _extract_font_info(frame)

        if not title and not body:
            logger.warning(f"데이터 추출 실패: {url}")
            return None

        return {
            "url": url,
            "title": title,
            "category": category,
            "body": body[:3000],  # 본문 길이 제한 (분석용)
            "body_length": len(body),
            "font_info": font_info,
        }

    except Exception as e:
        logger.warning(f"게시물 추출 오류 ({url}): {e}")
        return None


async def _extract_font_info(frame) -> dict:
    """SmartEditor 폰트 정보 추출 (se-ff-*, se-fs-* 클래스 + computed style)"""
    try:
        font_data = await frame.evaluate("""() => {
            const result = {
                font_families: {},
                font_sizes: {},
                computed_fonts: [],
            };

            // SmartEditor 클래스 기반 폰트 추출
            const allElements = document.querySelectorAll('[class*="se-ff-"], [class*="se-fs-"]');
            allElements.forEach(el => {
                const classes = Array.from(el.classList);
                classes.forEach(cls => {
                    if (cls.startsWith('se-ff-')) {
                        const font = cls.replace('se-ff-', '');
                        result.font_families[font] = (result.font_families[font] || 0) + 1;
                    }
                    if (cls.startsWith('se-fs-')) {
                        const size = cls.replace('se-fs-', '');
                        result.font_sizes[size] = (result.font_sizes[size] || 0) + 1;
                    }
                });
            });

            // computed style에서 폰트 추출 (본문 영역)
            const mainContainer = document.querySelector('.se-main-container');
            if (mainContainer) {
                const paragraphs = mainContainer.querySelectorAll('.se-text-paragraph');
                const seen = new Set();
                paragraphs.forEach((p, i) => {
                    if (i < 5) {  // 상위 5개 문단만
                        const style = window.getComputedStyle(p);
                        const key = `${style.fontFamily}|${style.fontSize}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            result.computed_fonts.push({
                                font_family: style.fontFamily,
                                font_size: style.fontSize,
                                font_weight: style.fontWeight,
                                line_height: style.lineHeight,
                            });
                        }
                    }
                });
            }

            return result;
        }""")
        return font_data
    except Exception as e:
        logger.debug(f"폰트 정보 추출 실패: {e}")
        return {"font_families": {}, "font_sizes": {}, "computed_fonts": []}


async def analyze_blog(blog_id: str, max_posts: int) -> None:
    """메인 크롤링 함수"""
    from playwright.async_api import async_playwright

    from src.utils.browser import create_browser

    logger.info(f"블로그 분석 시작: {blog_id} (최대 {max_posts}개)")

    async with async_playwright() as pw:
        browser, context, page = await create_browser(pw, headless=True)

        try:
            # 게시물 URL 수집
            post_urls = await _collect_post_urls(page, blog_id, max_posts)
            if not post_urls:
                logger.error("게시물 URL을 찾지 못했습니다")
                return

            # 개별 게시물 데이터 추출
            posts: list[dict] = []
            for i, url in enumerate(post_urls, 1):
                logger.info(f"게시물 추출 중 ({i}/{len(post_urls)}): {url}")
                data = await _extract_post_data(page, url)
                if data:
                    posts.append(data)
                await asyncio.sleep(1)  # 요청 간 딜레이

            # 결과 저장
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

            result = {
                "blog_id": blog_id,
                "total_collected": len(posts),
                "posts": posts,
                "font_summary": _summarize_fonts(posts),
            }

            with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            logger.info(f"크롤링 완료: {len(posts)}개 게시물 → {OUTPUT_PATH}")

        finally:
            await browser.close()


def _summarize_fonts(posts: list[dict]) -> dict:
    """전체 게시물에서 폰트 사용 통계 집계"""
    all_families: dict[str, int] = {}
    all_sizes: dict[str, int] = {}

    for post in posts:
        fi = post.get("font_info", {})
        for font, count in fi.get("font_families", {}).items():
            all_families[font] = all_families.get(font, 0) + count
        for size, count in fi.get("font_sizes", {}).items():
            all_sizes[size] = all_sizes.get(size, 0) + count

    # 사용 빈도순 정렬
    sorted_families = dict(sorted(all_families.items(), key=lambda x: x[1], reverse=True))
    sorted_sizes = dict(sorted(all_sizes.items(), key=lambda x: x[1], reverse=True))

    return {
        "font_families": sorted_families,
        "font_sizes": sorted_sizes,
        "primary_font": next(iter(sorted_families), ""),
        "primary_size": next(iter(sorted_sizes), ""),
    }


def main():
    parser = argparse.ArgumentParser(description="블로그 스타일 크롤링")
    parser.add_argument(
        "--blog-id",
        default=DEFAULT_BLOG_ID,
        help=f"분석할 블로그 ID (기본: {DEFAULT_BLOG_ID})",
    )
    parser.add_argument(
        "--max-posts",
        type=int,
        default=DEFAULT_MAX_POSTS,
        help=f"수집할 최대 게시물 수 (기본: {DEFAULT_MAX_POSTS})",
    )
    args = parser.parse_args()

    asyncio.run(analyze_blog(args.blog_id, args.max_posts))


if __name__ == "__main__":
    main()

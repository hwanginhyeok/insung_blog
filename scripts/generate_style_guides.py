"""
카테고리별 스타일 가이드 생성 — raw_posts.json 분석 → 5대 카테고리 스타일 가이드

사용법:
  source .venv/bin/activate
  python scripts/generate_style_guides.py

입력:
  skills/blog_analysis/raw_posts.json (analyze_blog_style.py 출력)

출력:
  skills/styles/맛집.md
  skills/styles/체험_일상.md
  skills/styles/재테크.md
  skills/styles/리뷰.md
  skills/styles/개인이벤트.md
  skills/styles/_font_config.json
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

from anthropic import Anthropic

from config.settings import CATEGORIES, CONTENT_AI_MODEL, PROJECT_ROOT
from src.utils.logger import logger

# 경로
RAW_POSTS_PATH = PROJECT_ROOT / "skills" / "blog_analysis" / "raw_posts.json"
STYLES_DIR = PROJECT_ROOT / "skills" / "styles"

# 카테고리명 → 파일명 매핑 (슬래시는 파일명에 못 쓰므로)
_CAT_FILENAME = {
    "맛집": "맛집",
    "체험/일상": "체험_일상",
    "재테크": "재테크",
    "리뷰": "리뷰",
    "개인이벤트": "개인이벤트",
}


def _get_client() -> Anthropic:
    """Anthropic 클라이언트 생성"""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY가 설정되지 않았습니다")
    return Anthropic(api_key=api_key)


def _load_raw_posts() -> dict:
    """raw_posts.json 로드"""
    if not RAW_POSTS_PATH.exists():
        raise FileNotFoundError(
            f"크롤링 데이터 없음: {RAW_POSTS_PATH}\n"
            "먼저 python scripts/analyze_blog_style.py 를 실행하세요."
        )
    with open(RAW_POSTS_PATH, encoding="utf-8") as f:
        return json.load(f)


def _classify_posts(client: Anthropic, posts: list[dict]) -> dict[str, list[dict]]:
    """AI로 게시물을 4대 카테고리로 분류"""
    # 게시물 요약 (제목 + 카테고리 + 본문 앞 200자)
    summaries = []
    for i, p in enumerate(posts):
        summary = (
            f"[{i}] 제목: {p.get('title', '')}\n"
            f"    카테고리: {p.get('category', '없음')}\n"
            f"    본문 시작: {p.get('body', '')[:200]}"
        )
        summaries.append(summary)

    categories_str = ", ".join(CATEGORIES)
    prompt = f"""\
아래 블로그 게시물들을 5개 카테고리로 분류해줘: {categories_str}

분류 기준:
- 맛집: 음식점, 카페, 뷔페, 술집 등 외식 관련
- 체험/일상: 운전면허, 공방, 데이트, 스케이트 등 일상 체험
- 재테크: 적금, 예금, 앱테크, 이벤트 등 돈 관련
- 리뷰: 제품리뷰, 간식, 가전, 식품 등 물건 후기
- 개인이벤트: 결혼, 임신, 신혼여행 등 인생 이벤트

각 게시물 번호를 해당 카테고리에 배정해.
어디에도 해당하지 않으면 "체험/일상"으로.

출력 형식 (JSON만, 설명 없이):
{{"맛집": [0, 3], "체험/일상": [1, 7], "재테크": [2, 4], "리뷰": [6], "개인이벤트": [5, 8]}}

게시물 목록:
{chr(10).join(summaries)}"""

    response = client.messages.create(
        model=CONTENT_AI_MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()

    # JSON 파싱 (코드블록 래핑 제거)
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])

    try:
        mapping = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("분류 JSON 파싱 실패, 폴백으로 전체를 체험/일상으로 분류")
        mapping = {"체험/일상": list(range(len(posts)))}

    # 인덱스 → 실제 게시물 매핑
    grouped: dict[str, list[dict]] = {cat: [] for cat in CATEGORIES}
    for cat, indices in mapping.items():
        if cat not in grouped:
            cat = "체험/일상"  # 알 수 없는 카테고리는 체험/일상으로
        for idx in indices:
            if 0 <= idx < len(posts):
                grouped[cat].append(posts[idx])

    for cat, items in grouped.items():
        logger.info(f"카테고리 [{cat}]: {len(items)}개 게시물")

    return grouped


def _generate_style_guide(
    client: Anthropic, category: str, posts: list[dict]
) -> str:
    """특정 카테고리의 게시물들을 분석하여 스타일 가이드 생성"""
    if not posts:
        return _default_style_guide(category)

    # 게시물 본문 샘플 (최대 5개, 각 800자)
    samples = []
    for p in posts[:5]:
        samples.append(
            f"제목: {p.get('title', '')}\n"
            f"본문:\n{p.get('body', '')[:800]}\n"
        )

    prompt = f"""\
아래는 네이버 블로그의 [{category}] 카테고리 게시물 샘플이야.
이 블로거의 글쓰기 스타일을 분석해서, AI가 같은 스타일로 글을 쓸 수 있도록 스타일 가이드를 만들어줘.

분석 항목:
1. **말투**: 어미 패턴, 존칭/반말, 감탄사 사용 습관
2. **구조**: 글의 전개 방식 (도입-본문-마무리 패턴)
3. **표현**: 자주 쓰는 표현, 비유, 감성 키워드
4. **길이**: 평균 문장 길이, 문단 구성
5. **{category} 특화**: 이 카테고리에서만 나타나는 특징

마크다운 형식으로 출력해줘. 각 섹션은 ## 헤딩으로.
실제 예시 표현을 인용부호로 포함해줘.

게시물 샘플:
{'---'.join(samples)}"""

    response = client.messages.create(
        model=CONTENT_AI_MODEL,
        max_tokens=1500,
        system=(
            "너는 블로그 글쓰기 코치야. "
            "실제 블로거의 글을 분석해서 AI가 동일한 톤으로 글을 쓸 수 있는 "
            "구체적이고 실용적인 스타일 가이드를 작성해."
        ),
        messages=[{"role": "user", "content": prompt}],
    )

    guide_content = response.content[0].text.strip()

    blog_id = "youyoubear0517"
    # 마크다운 파일 형식으로 래핑
    result = (
        f"# {category} 스타일 가이드\n\n"
        f"> {blog_id} 블로그 {category} 게시물 {len(posts)}편 분석 기반\n"
        f"> AI가 {category} 카테고리 게시물 초안 생성 시 이 가이드를 반드시 따른다.\n\n"
        f"---\n\n"
        f"{guide_content}\n"
    )

    return result


def _default_style_guide(category: str) -> str:
    """게시물이 없는 카테고리의 기본 스타일 가이드"""
    return (
        f"# {category} 스타일 가이드\n\n"
        f"> 이 카테고리의 참조 게시물이 없어 기본 스타일을 적용합니다.\n"
        f"> 게시물이 누적되면 `scripts/generate_style_guides.py`를 재실행하세요.\n\n"
        f"---\n\n"
        f"## 말투\n"
        f"- 친근한 해요체 (~했어요, ~이에요)\n"
        f"- 가볍고 일상적인 톤\n\n"
        f"## 구조\n"
        f"1. 도입 (2~3문장)\n"
        f"2. 메인 (4~6문장)\n"
        f"3. 마무리 (2~3문장)\n\n"
        f"## 길이\n"
        f"- 본문: 500~800자\n"
        f"- 제목: 20~25자\n"
    )


def _generate_font_config(raw_data: dict) -> dict:
    """폰트 설정 JSON 생성"""
    font_summary = raw_data.get("font_summary", {})

    # 가장 많이 사용된 폰트 패밀리와 사이즈
    families = font_summary.get("font_families", {})
    sizes = font_summary.get("font_sizes", {})
    primary_font = font_summary.get("primary_font", "")
    primary_size = font_summary.get("primary_size", "")

    # SmartEditor 클래스명 → 실제 폰트명 매핑
    font_class_map = {
        "nanumgothic": "나눔고딕",
        "nanummyeongjo": "나눔명조",
        "nanumsquare": "나눔스퀘어",
        "nanumbarunpen": "나눔바른펜",
        "nanumbareunhipi": "나눔바른히피",
        "malgunbd": "맑은 고딕",
        "gulim": "굴림",
        "dotum": "돋움",
        "batang": "바탕",
        "system": "시스템 기본",
    }

    font_name = font_class_map.get(primary_font, primary_font)

    config = {
        "primary_font": {
            "class_name": primary_font,
            "display_name": font_name,
        },
        "primary_size": primary_size,
        "all_fonts": {k: font_class_map.get(k, k) for k in families.keys()},
        "all_sizes": sizes,
        "apply_font": bool(primary_font),
        "apply_size": bool(primary_size),
    }

    return config


def main():
    logger.info("카테고리별 스타일 가이드 생성 시작")

    # 데이터 로드
    raw_data = _load_raw_posts()
    posts = raw_data.get("posts", [])
    if not posts:
        logger.error("수집된 게시물이 없습니다")
        return

    logger.info(f"총 {len(posts)}개 게시물 로드됨")

    # Claude 클라이언트
    client = _get_client()

    # 게시물 분류
    grouped = _classify_posts(client, posts)

    # 카테고리별 스타일 가이드 생성
    STYLES_DIR.mkdir(parents=True, exist_ok=True)

    for category in CATEGORIES:
        cat_posts = grouped.get(category, [])
        logger.info(f"[{category}] 스타일 가이드 생성 중... ({len(cat_posts)}개 샘플)")

        guide = _generate_style_guide(client, category, cat_posts)

        filename = _CAT_FILENAME.get(category, category.replace("/", "_"))
        output_path = STYLES_DIR / f"{filename}.md"
        output_path.write_text(guide, encoding="utf-8")
        logger.info(f"[{category}] 스타일 가이드 저장: {output_path}")

    # 폰트 설정 생성
    font_config = _generate_font_config(raw_data)
    font_config_path = STYLES_DIR / "_font_config.json"
    with open(font_config_path, "w", encoding="utf-8") as f:
        json.dump(font_config, f, ensure_ascii=False, indent=2)
    logger.info(f"폰트 설정 저장: {font_config_path}")

    logger.info("스타일 가이드 생성 완료!")
    print("\n생성된 파일:")
    for cat in CATEGORIES:
        filename = _CAT_FILENAME.get(cat, cat.replace("/", "_"))
        print(f"  - skills/styles/{filename}.md")
    print("  - skills/styles/_font_config.json")


if __name__ == "__main__":
    main()

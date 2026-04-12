"""
사용자 본인 블로그 분야 자동 추출 (Phase 1 of NEIGHBOR-AI-DISCOVER)

흐름:
  1. 네이버 RSS 페치 (urllib + xml.etree, 외부 의존성 0)
  2. 최근 글 제목 + description 수집
  3. Haiku 호출 → 분야(categories) + 검색용 키워드(keywords) 추출
  4. bot_settings.discovered_categories / discovered_keywords 업데이트

호출 시점:
  - 사용자 가입 시 1회 (가입 직후 자동 트리거 — 별도 통합)
  - 30일 마다 자동 갱신 (cron 또는 Phase 2 발견 직전 lazy 재분석)
  - 사용자가 봇 페이지 "분야 재분석" 버튼 누를 때 동기 호출
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

from anthropic import Anthropic

from src.storage.supabase_client import get_supabase
from src.utils.logger import setup_logger

logger = setup_logger("blog_profile_extractor")

# 네이버 RSS — 일부 블로그는 RSS 비활성화 가능. 폴백은 빈 결과.
_RSS_URL_TEMPLATE = "https://rss.blog.naver.com/{blog_id}.xml"
_RSS_TIMEOUT_SEC = 10
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# 최대 분석 글 수 (RSS 응답에서)
_MAX_RSS_ITEMS = 15

# 갱신 주기 (30일)
_REANALYZE_AFTER_DAYS = 30

# Haiku 모델
_HAIKU_MODEL = "claude-haiku-4-5-20251001"


def _strip_html(text: str) -> str:
    """간단 HTML 태그 제거 (외부 deps 없이)."""
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def fetch_blog_rss(blog_id: str) -> dict[str, Any] | None:
    """
    네이버 RSS 페치 → 제목 + description 추출.

    Returns:
        {
            "blog_name": str,
            "items": [{"title": str, "summary": str, "pubDate": str}, ...]
        }
        실패 시 None.
    """
    if not blog_id:
        return None

    url = _RSS_URL_TEMPLATE.format(blog_id=blog_id)
    req = Request(url, headers={"User-Agent": _USER_AGENT})

    try:
        with urlopen(req, timeout=_RSS_TIMEOUT_SEC) as resp:
            raw = resp.read()
    except (HTTPError, URLError, TimeoutError) as e:
        logger.warning(f"RSS 페치 실패 [{blog_id}]: {e}")
        return None
    except Exception as e:
        logger.warning(f"RSS 페치 예외 [{blog_id}]: {e}")
        return None

    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        logger.warning(f"RSS XML 파싱 실패 [{blog_id}]: {e}")
        return None

    # 네이버 RSS는 표준 RSS 2.0 — channel/item 구조
    channel = root.find("channel")
    if channel is None:
        return None

    blog_name_el = channel.find("title")
    blog_name = (blog_name_el.text or "").strip() if blog_name_el is not None else ""

    items: list[dict[str, str]] = []
    for item_el in channel.findall("item")[:_MAX_RSS_ITEMS]:
        title_el = item_el.find("title")
        desc_el = item_el.find("description")
        date_el = item_el.find("pubDate")

        title = (title_el.text or "").strip() if title_el is not None else ""
        desc = _strip_html(desc_el.text or "") if desc_el is not None else ""
        # description 너무 길면 자름 (Haiku 토큰 절약)
        if len(desc) > 300:
            desc = desc[:300] + "..."
        pub_date = (date_el.text or "").strip() if date_el is not None else ""

        if title:
            items.append({"title": title, "summary": desc, "pubDate": pub_date})

    return {
        "blog_name": blog_name,
        "items": items,
    }


def _build_haiku_prompt(blog_name: str, items: list[dict[str, str]]) -> str:
    """Haiku에게 분야 추출 요청하는 프롬프트."""
    posts_text = "\n\n".join(
        f"[글 {i + 1}] 제목: {it['title']}\n요약: {it['summary'][:200]}"
        for i, it in enumerate(items[:10])
    )

    return f"""다음은 한 네이버 블로거의 최근 글 목록입니다. 이 블로거의 주요 관심 분야와 검색용 키워드를 추출해주세요.

블로그 이름: {blog_name}

{posts_text}

요청:
1. **categories**: 이 블로거의 주요 분야 3~5개 (한국어, 명사형, 예: "맛집", "여행", "육아")
2. **keywords**: 이 블로거와 비슷한 블로거를 찾기 위해 네이버 검색에 쓸 키워드 5~8개
   - 너무 일반적인 단어 X (예: "일상", "블로그")
   - 구체적이고 검색 가능한 단어 (예: "강남 맛집", "캠핑 장비", "백패킹 코스")

JSON 형식으로만 응답:
{{"categories": ["분야1", "분야2", "분야3"], "keywords": ["키워드1", "키워드2", ...]}}
"""


def _call_haiku(prompt: str) -> dict[str, list[str]]:
    """Haiku 호출 → JSON 응답 파싱."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY 없음 — 빈 분야 반환")
        return {"categories": [], "keywords": []}

    client = Anthropic(api_key=api_key)

    try:
        msg = client.messages.create(
            model=_HAIKU_MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text if msg.content else ""
    except Exception as e:
        logger.error(f"Haiku 호출 실패: {e}")
        return {"categories": [], "keywords": []}

    # JSON 추출 (Haiku가 가끔 코드블록으로 감싸서 응답)
    json_match = re.search(r"\{.*\}", text, re.DOTALL)
    if not json_match:
        logger.warning(f"Haiku 응답에 JSON 없음: {text[:200]}")
        return {"categories": [], "keywords": []}

    try:
        parsed = json.loads(json_match.group(0))
    except json.JSONDecodeError as e:
        logger.warning(f"Haiku JSON 파싱 실패: {e}")
        return {"categories": [], "keywords": []}

    categories = [str(c) for c in parsed.get("categories", []) if c]
    keywords = [str(k) for k in parsed.get("keywords", []) if k]

    return {
        "categories": categories[:5],
        "keywords": keywords[:8],
    }


def extract_blog_profile(blog_id: str) -> dict[str, Any]:
    """
    블로그 RSS 페치 + Haiku 분석 → 분야/키워드 추출.

    Returns:
        {
            "blog_name": str,
            "categories": [str, ...],
            "keywords": [str, ...],
            "post_count_30d": int,    # 최근 30일 글 수 (참조용)
            "items_analyzed": int,
        }
    """
    rss = fetch_blog_rss(blog_id)
    if not rss or not rss["items"]:
        logger.warning(f"RSS 페치 결과 없음 [{blog_id}]")
        return {
            "blog_name": "",
            "categories": [],
            "keywords": [],
            "post_count_30d": 0,
            "items_analyzed": 0,
        }

    # 최근 30일 글 수 계산 (Phase 2 휴면 판정에도 활용)
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    post_count_30d = 0
    for it in rss["items"]:
        try:
            pub = datetime.strptime(it["pubDate"], "%a, %d %b %Y %H:%M:%S %z")
            if pub >= thirty_days_ago:
                post_count_30d += 1
        except (ValueError, KeyError):
            continue

    extracted = _call_haiku(_build_haiku_prompt(rss["blog_name"], rss["items"]))

    return {
        "blog_name": rss["blog_name"],
        "categories": extracted["categories"],
        "keywords": extracted["keywords"],
        "post_count_30d": post_count_30d,
        "items_analyzed": len(rss["items"]),
    }


def update_user_blog_profile(user_id: str, force: bool = False) -> dict[str, Any]:
    """
    사용자 본인 블로그 분석 후 bot_settings에 저장.

    Args:
        user_id: 사용자 UUID
        force: True면 categories_analyzed_at 무시하고 강제 재분석

    Returns:
        {
            "ok": bool,
            "categories": [...],
            "keywords": [...],
            "skipped": bool,    # 30일 안 지나서 스킵한 경우
            "reason": str,
        }
    """
    sb = get_supabase()

    # bot_settings 조회
    res = sb.table("bot_settings").select(
        "naver_blog_id, naver_blog_ids, discovered_categories, discovered_keywords, categories_analyzed_at"
    ).eq("user_id", user_id).limit(1).execute()

    if not res.data:
        return {"ok": False, "reason": "bot_settings 없음", "categories": [], "keywords": [], "skipped": False}

    settings = res.data[0]
    blog_id = settings.get("naver_blog_id") or (settings.get("naver_blog_ids") or [None])[0]

    if not blog_id:
        return {"ok": False, "reason": "blog_id 미설정", "categories": [], "keywords": [], "skipped": False}

    # 갱신 주기 체크
    if not force and settings.get("categories_analyzed_at"):
        try:
            last_analyzed = datetime.fromisoformat(
                settings["categories_analyzed_at"].replace("Z", "+00:00")
            )
            now = datetime.now(timezone.utc)
            if (now - last_analyzed).days < _REANALYZE_AFTER_DAYS:
                return {
                    "ok": True,
                    "skipped": True,
                    "reason": f"{_REANALYZE_AFTER_DAYS}일 미경과 — 캐시 사용",
                    "categories": settings.get("discovered_categories") or [],
                    "keywords": settings.get("discovered_keywords") or [],
                }
        except (ValueError, AttributeError):
            pass  # 파싱 실패 시 강제 재분석

    # 분석 실행
    profile = extract_blog_profile(blog_id)

    if not profile["categories"]:
        return {
            "ok": False,
            "reason": "분야 추출 실패 (RSS 또는 Haiku)",
            "categories": [],
            "keywords": [],
            "skipped": False,
        }

    # bot_settings 업데이트
    try:
        sb.table("bot_settings").update({
            "discovered_categories": profile["categories"],
            "discovered_keywords": profile["keywords"],
            "categories_analyzed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()
        logger.info(
            f"사용자 블로그 분야 업데이트 [{user_id[:8]}] "
            f"categories={profile['categories']}, keywords={len(profile['keywords'])}개"
        )
    except Exception as e:
        logger.error(f"bot_settings 업데이트 실패: {e}")
        return {"ok": False, "reason": str(e), "categories": [], "keywords": [], "skipped": False}

    return {
        "ok": True,
        "skipped": False,
        "blog_name": profile["blog_name"],
        "categories": profile["categories"],
        "keywords": profile["keywords"],
        "post_count_30d": profile["post_count_30d"],
        "items_analyzed": profile["items_analyzed"],
    }

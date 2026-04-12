"""
이웃찾기 AI 필터 (Phase 2 of NEIGHBOR-AI-DISCOVER)

블로그를 7-flag로 분류하고 글로벌 캐시(neighbor_blog_profile)에 저장.

핵심 원칙:
  - Haiku 호출은 글로벌 판정만 (quality_flag + main_topics + 점수)
  - 사용자별 적합도(relevance)는 코드 매칭 (캐시 깨지지 않음)
  - 캐시 hit 시 Haiku 호출 X
  - 영구차단(ad/ai/commercial/low_quality)은 만료 없음
  - inactive는 90일 후 재분석
  - ok는 180일 후 재분석
  - review_farm은 분류만 (만료 없음, 체험단은 향후 별도 기능)
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone, timedelta
from typing import Any

from anthropic import Anthropic

from src.neighbor.blog_profile_extractor import fetch_blog_rss
from src.storage.supabase_client import get_supabase
from src.utils.logger import setup_logger

logger = setup_logger("neighbor_ai_filter")

_HAIKU_MODEL = "claude-haiku-4-5-20251001"
_ANALYZER_TAG = "haiku-3.5"

# 캐시 만료 (일 단위) — quality_flag별
_CACHE_TTL_DAYS = {
    "ok": 180,
    "inactive": 90,
    # 영구차단/분류 (만료 없음)
    "ad": None,
    "ai": None,
    "commercial": None,
    "low_quality": None,
    "review_farm": None,
}

_PERMANENTLY_BLOCKED_FLAGS = {"ad", "ai", "commercial", "low_quality"}

VALID_FLAGS = {"ok", "ad", "ai", "commercial", "review_farm", "inactive", "low_quality"}


# ============================================================
# Haiku 판정 프롬프트
# ============================================================
def _build_judgment_prompt(blog_name: str, items: list[dict[str, str]]) -> str:
    posts_text = "\n\n".join(
        f"[글 {i + 1}] 제목: {it.get('title', '')}\n요약: {(it.get('summary', '') or '')[:200]}"
        for i, it in enumerate(items[:5])
    )
    if not posts_text:
        posts_text = "(글 없음)"

    return f"""다음 네이버 블로그를 7가지 카테고리 중 하나로 정확히 분류해주세요.

블로그명: {blog_name or '(이름 없음)'}

최근 글:
{posts_text}

분류 기준:
- **ok**: 정상 개인 블로그 (개인의 일상/관심사/취미를 진정성 있게 공유)
- **ad**: 광고/제휴 마케팅 위주 (쿠팡파트너스, 제휴 링크, 협찬 후기 일색, 상업적 의도 강함)
- **ai**: AI로 생성된 의심 (어색한 한국어, 동일 구조 반복, 메타 표현 "이번 글에서는", "다음과 같습니다" 과다)
- **commercial**: 가게/쇼핑몰/기업 PR (사업자, 주문 안내, 자사 상품 홍보)
- **review_farm**: 체험단/협찬 후기만 도배 ("체험단으로 받았습니다", "원고료 지급" 명시)
- **inactive**: 휴면 (글이 너무 적거나 오래됨)
- **low_quality**: 펌글/스크랩 위주, 본인 콘텐츠 부족, 200자 미만 짧은 도배

다음 정보도 함께 추출:
- **main_topics**: 이 블로그의 주요 주제 2~4개 (한국어 명사형, 예: "맛집", "여행", "IT")
- **ad_score**: 광고성 점수 0.0~1.0
- **ai_score**: AI 생성 의심 점수 0.0~1.0
- **reasoning**: 한 줄로 판정 근거 (한국어, 50자 이내)

JSON으로만 응답:
{{"quality_flag":"ok|ad|ai|commercial|review_farm|inactive|low_quality","ad_score":0.0,"ai_score":0.0,"main_topics":["주제1","주제2"],"reasoning":"근거"}}
"""


def _call_haiku_judgment(blog_name: str, items: list[dict[str, str]]) -> dict[str, Any]:
    """Haiku 호출 → JSON 응답 파싱. 실패 시 보수적 ok 반환 (cache는 안 함)."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY 없음")
        return {"_error": "no_api_key"}

    client = Anthropic(api_key=api_key)

    try:
        msg = client.messages.create(
            model=_HAIKU_MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": _build_judgment_prompt(blog_name, items)}],
        )
        text = msg.content[0].text if msg.content else ""
    except Exception as e:
        logger.error(f"Haiku 호출 실패: {e}")
        return {"_error": str(e)}

    # JSON 추출
    json_match = re.search(r"\{.*\}", text, re.DOTALL)
    if not json_match:
        logger.warning(f"Haiku 응답에 JSON 없음: {text[:200]}")
        return {"_error": "no_json"}

    try:
        parsed = json.loads(json_match.group(0))
    except json.JSONDecodeError as e:
        logger.warning(f"Haiku JSON 파싱 실패: {e}")
        return {"_error": "json_parse"}

    flag = str(parsed.get("quality_flag", "")).strip().lower()
    if flag not in VALID_FLAGS:
        logger.warning(f"Haiku 잘못된 flag: {flag}")
        return {"_error": "invalid_flag"}

    return {
        "quality_flag": flag,
        "ad_score": float(parsed.get("ad_score", 0) or 0),
        "ai_score": float(parsed.get("ai_score", 0) or 0),
        "main_topics": [str(t) for t in (parsed.get("main_topics", []) or []) if t][:4],
        "reasoning": str(parsed.get("reasoning", ""))[:300],
    }


# ============================================================
# 캐시 조회 / 만료 판단
# ============================================================
def _is_cache_fresh(profile: dict[str, Any]) -> bool:
    """캐시가 아직 유효한가?"""
    if profile.get("manually_corrected"):
        return True  # 수동 수정은 만료 없음

    flag = profile.get("quality_flag")
    ttl_days = _CACHE_TTL_DAYS.get(flag)

    if ttl_days is None:
        # 영구 (ad/ai/commercial/low_quality/review_farm) — 만료 없음
        return True

    analyzed_at_str = profile.get("analyzed_at")
    if not analyzed_at_str:
        return False

    try:
        analyzed_at = datetime.fromisoformat(analyzed_at_str.replace("Z", "+00:00"))
        age = datetime.now(timezone.utc) - analyzed_at
        return age.days < ttl_days
    except (ValueError, AttributeError):
        return False


def get_cached_profile(blog_id: str) -> dict[str, Any] | None:
    """글로벌 캐시 조회. 만료된 경우에도 데이터는 반환 (호출자가 _is_cache_fresh 체크)."""
    sb = get_supabase()
    try:
        res = sb.table("neighbor_blog_profile").select("*").eq("blog_id", blog_id).limit(1).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.warning(f"캐시 조회 실패 [{blog_id}]: {e}")
        return None


# ============================================================
# 단일 블로그 판정 (캐시 → RSS → Haiku → 캐시 저장)
# ============================================================
def judge_blog(blog_id: str, force: bool = False) -> dict[str, Any] | None:
    """
    단일 블로그를 7-flag로 판정.

    Returns:
        {
            "blog_id": str,
            "blog_name": str,
            "quality_flag": str,
            "ad_score": float,
            "ai_score": float,
            "main_topics": [str, ...],
            "reasoning": str,
            "permanently_blocked": bool,
            "from_cache": bool,
            "post_count_30d": int,
        }
        실패 시 None.
    """
    cached = get_cached_profile(blog_id)
    if cached and not force and _is_cache_fresh(cached):
        return {
            "blog_id": blog_id,
            "blog_name": cached.get("blog_name") or "",
            "quality_flag": cached["quality_flag"],
            "ad_score": float(cached.get("ad_score") or 0),
            "ai_score": float(cached.get("ai_score") or 0),
            "main_topics": cached.get("main_topics") or [],
            "reasoning": cached.get("reasoning") or "",
            "permanently_blocked": cached.get("permanently_blocked", False),
            "from_cache": True,
            "post_count_30d": int(cached.get("post_count_30d") or 0),
        }

    # 캐시 miss 또는 만료 → RSS 페치
    rss = fetch_blog_rss(blog_id)
    if not rss:
        # RSS 페치 실패 → inactive로 캐시 (90일 후 재검사 가능)
        result = {
            "blog_id": blog_id,
            "blog_name": "",
            "quality_flag": "inactive",
            "ad_score": 0.0,
            "ai_score": 0.0,
            "main_topics": [],
            "reasoning": "RSS 페치 실패 — 휴면 또는 비공개 가능성",
            "permanently_blocked": False,
            "from_cache": False,
            "post_count_30d": 0,
        }
        _save_profile_to_cache(result)
        return result

    blog_name = rss["blog_name"]
    items = rss["items"]

    # 글이 5개 미만이면 inactive 처리 (Haiku 호출 안 함 — 비용 절감)
    if len(items) < 3:
        result = {
            "blog_id": blog_id,
            "blog_name": blog_name,
            "quality_flag": "inactive",
            "ad_score": 0.0,
            "ai_score": 0.0,
            "main_topics": [],
            "reasoning": f"최근 글 {len(items)}개 — 휴면",
            "permanently_blocked": False,
            "from_cache": False,
            "post_count_30d": _count_recent_posts(items, days=30),
        }
        _save_profile_to_cache(result)
        return result

    # 최근 30일 글 수 계산
    post_count_30d = _count_recent_posts(items, days=30)

    # Haiku 판정
    judgment = _call_haiku_judgment(blog_name, items)
    if judgment.get("_error"):
        logger.warning(f"Haiku 판정 실패 [{blog_id}]: {judgment['_error']}")
        return None

    flag = judgment["quality_flag"]
    permanently_blocked = flag in _PERMANENTLY_BLOCKED_FLAGS

    result = {
        "blog_id": blog_id,
        "blog_name": blog_name,
        "quality_flag": flag,
        "ad_score": judgment["ad_score"],
        "ai_score": judgment["ai_score"],
        "main_topics": judgment["main_topics"],
        "reasoning": judgment["reasoning"],
        "permanently_blocked": permanently_blocked,
        "from_cache": False,
        "post_count_30d": post_count_30d,
    }
    _save_profile_to_cache(result)
    return result


def _count_recent_posts(items: list[dict[str, str]], days: int) -> int:
    """RSS items에서 N일 이내 글 수 계산."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    count = 0
    for it in items:
        try:
            pub = datetime.strptime(it.get("pubDate", ""), "%a, %d %b %Y %H:%M:%S %z")
            if pub >= cutoff:
                count += 1
        except (ValueError, KeyError):
            continue
    return count


def _save_profile_to_cache(result: dict[str, Any]) -> None:
    """판정 결과를 neighbor_blog_profile에 upsert. last_post_at은 RSS에서 추출 가능하면 추가."""
    sb = get_supabase()
    payload = {
        "blog_id": result["blog_id"],
        "blog_name": result["blog_name"],
        "quality_flag": result["quality_flag"],
        "ad_score": result["ad_score"],
        "ai_score": result["ai_score"],
        "main_topics": result["main_topics"],
        "reasoning": result["reasoning"],
        "post_count_30d": result["post_count_30d"],
        "permanently_blocked": result["permanently_blocked"],
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "analyzer": _ANALYZER_TAG,
    }
    try:
        sb.table("neighbor_blog_profile").upsert(payload, on_conflict="blog_id").execute()
    except Exception as e:
        logger.error(f"캐시 저장 실패 [{result['blog_id']}]: {e}")


# ============================================================
# 사용자 분야 매칭 (코드, Haiku 호출 X)
# ============================================================
def calc_relevance(
    user_categories: list[str],
    user_keywords: list[str],
    main_topics: list[str],
) -> tuple[str, float]:
    """
    main_topics ↔ user_categories/keywords 매칭으로 적합도 계산.
    Haiku 호출 없이 코드로만 (글로벌 캐시 깨지지 않게).

    Returns:
        ("relevant"|"off_topic"|"uncertain", score 0~1)
    """
    if not main_topics:
        return "uncertain", 0.0
    if not user_categories and not user_keywords:
        return "uncertain", 0.0

    user_terms = {c.strip().lower() for c in user_categories if c}
    user_terms.update({k.strip().lower() for k in user_keywords if k})
    topics = {t.strip().lower() for t in main_topics if t}

    if not user_terms or not topics:
        return "uncertain", 0.0

    # 정확 매칭 + 부분 문자열 매칭
    exact = user_terms & topics
    partial_pairs = sum(
        1
        for u in user_terms
        for t in topics
        if u != t and (u in t or t in u) and len(min(u, t, key=len)) >= 2
    )

    # 점수: 정확 매칭은 1점, 부분 매칭은 0.5점
    raw_score = len(exact) * 1.0 + partial_pairs * 0.5
    # 정규화: topics 수 또는 user_terms 수 중 작은 값으로 나눔
    denom = max(min(len(topics), len(user_terms)), 1)
    score = min(raw_score / denom, 1.0)

    if score >= 0.5:
        return "relevant", score
    elif score >= 0.2:
        return "uncertain", score
    else:
        return "off_topic", score

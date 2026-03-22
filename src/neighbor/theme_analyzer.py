"""
블로그 테마 자동 분석 — 게시물 제목 키워드 기반 테마 추출.

외부 API 호출 없이 키워드 매칭으로 테마를 분류한다.
orchestrator 또는 주기적 배치에서 호출.
"""
from collections import Counter

from src.storage.supabase_client import get_supabase, _resolve_user_id
from src.utils.logger import setup_logger

logger = setup_logger("theme_analyzer")

# 테마별 키워드 사전
_THEME_KEYWORDS: dict[str, list[str]] = {
    "맛집": ["맛집", "맛있", "음식", "식당", "메뉴", "먹방", "요리", "레시피", "카페", "디저트", "빵", "커피"],
    "카페": ["카페", "커피", "디저트", "브런치", "베이커리", "라떼"],
    "여행": ["여행", "관광", "숙소", "호텔", "리조트", "바다", "산", "힐링", "드라이브", "국내여행", "해외여행"],
    "육아": ["육아", "아이", "아기", "유아", "초등", "어린이", "교육", "학원"],
    "뷰티": ["뷰티", "화장품", "스킨케어", "메이크업", "향수", "네일"],
    "패션": ["패션", "옷", "코디", "쇼핑", "브랜드", "아울렛"],
    "인테리어": ["인테리어", "가구", "리모델링", "수납", "데코", "홈스타일"],
    "운동": ["운동", "헬스", "피트니스", "필라테스", "요가", "러닝", "등산"],
    "반려동물": ["강아지", "고양이", "반려", "펫", "동물", "산책"],
    "일상": ["일상", "일기", "하루", "기록"],
    "IT": ["개발", "코딩", "프로그래밍", "앱", "소프트웨어", "기술", "IT", "테크"],
    "재테크": ["주식", "투자", "부동산", "재테크", "수익", "경제", "ETF"],
}


def analyze_blog_themes(
    post_titles: list[str],
    top_n: int = 3,
) -> list[str]:
    """
    게시물 제목 목록에서 주요 테마를 추출.

    Args:
        post_titles: 게시물 제목 리스트
        top_n: 반환할 최대 테마 수

    Returns:
        ["맛집", "여행"] 형태의 테마 리스트
    """
    if not post_titles:
        return []

    theme_scores: Counter[str] = Counter()

    for title in post_titles:
        title_lower = title.lower()
        for theme, keywords in _THEME_KEYWORDS.items():
            for kw in keywords:
                if kw in title_lower:
                    theme_scores[theme] += 1
                    break  # 테마당 제목 1건으로 카운트

    if not theme_scores:
        return ["일상"]  # 기본 테마

    return [theme for theme, _ in theme_scores.most_common(top_n)]


def update_user_themes(
    post_titles: list[str],
    user_id: str | None = None,
) -> list[str]:
    """
    게시물 제목으로 테마 분석 → bot_settings.blog_themes 업데이트.

    Returns:
        업데이트된 테마 리스트
    """
    uid = _resolve_user_id(user_id)
    themes = analyze_blog_themes(post_titles)

    if not themes:
        return []

    try:
        sb = get_supabase()
        sb.table("bot_settings").update({
            "blog_themes": themes,
        }).eq("user_id", uid).execute()

        logger.info(f"블로그 테마 업데이트: {themes}")
    except Exception as e:
        logger.warning(f"테마 업데이트 실패: {e}")

    return themes

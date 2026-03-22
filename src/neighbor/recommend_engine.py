"""
이웃 추천 엔진 — 교류 빈도 + 테마 기반 추천 데이터 생성.

흐름:
  1. 이웃 목록에서 'discovered' 상태인 후보 조회
  2. 교류 빈도(interaction 횟수)로 점수 산출
  3. 블로그 테마 매칭으로 보너스 점수 부여
  4. 이미 추천한 이웃 제외
  5. neighbor_recommendations 테이블에 INSERT
"""
from datetime import datetime, timezone, timedelta

from src.storage.supabase_client import get_supabase, _resolve_user_id
from src.utils.logger import setup_logger

logger = setup_logger("recommend_engine")

# 추천 점수 가중치
_INTERACTION_WEIGHT = 2.0   # 교류 1회당 점수
_THEME_MATCH_BONUS = 5.0    # 테마 일치 시 보너스
_RECENCY_BONUS = 3.0        # 최근 교류(7일 내) 보너스
_BASE_SCORE = 1.0           # 기본 점수


def generate_recommendations(
    user_id: str | None = None,
    max_recommendations: int = 20,
) -> dict:
    """
    이웃 추천 목록 생성 → neighbor_recommendations 테이블에 저장.

    Args:
        user_id: 대상 사용자 ID
        max_recommendations: 최대 추천 수

    Returns:
        { generated: int, skipped: int, message: str }
    """
    uid = _resolve_user_id(user_id)
    sb = get_supabase()

    # 1. discovered 이웃 + 일방 팔로워 (아직 서로이웃이 아닌 후보)
    candidates_result = (
        sb.table("neighbors")
        .select("blog_id, blog_name, category, last_interaction_at")
        .eq("user_id", uid)
        .in_("neighbor_type", ["discovered", "one_way_follower"])
        .execute()
    )
    candidates = candidates_result.data or []

    if not candidates:
        logger.info("추천 후보가 없습니다 (discovered/follower 이웃 없음)")
        return {"generated": 0, "skipped": 0, "message": "추천 후보 없음"}

    # 2. 이미 추천된 blog_id 조회 (중복 방지)
    existing_result = (
        sb.table("neighbor_recommendations")
        .select("blog_id")
        .eq("user_id", uid)
        .in_("status", ["pending", "applied"])
        .execute()
    )
    existing_ids = {r["blog_id"] for r in (existing_result.data or [])}

    # 3. 이미 서로이웃 신청한 blog_id 제외
    requested_result = (
        sb.table("neighbor_requests")
        .select("target_blog_id")
        .eq("user_id", uid)
        .in_("status", ["sent", "accepted"])
        .execute()
    )
    requested_ids = {r["target_blog_id"] for r in (requested_result.data or [])}

    # 4. 사용자 블로그 테마 조회
    settings_result = (
        sb.table("bot_settings")
        .select("blog_themes")
        .eq("user_id", uid)
        .limit(1)
        .execute()
    )
    user_themes: list[str] = []
    if settings_result.data and settings_result.data[0].get("blog_themes"):
        user_themes = [t.lower() for t in settings_result.data[0]["blog_themes"]]

    # 5. 교류 기록 조회 (최근 30일)
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    interactions_result = (
        sb.table("neighbor_interactions")
        .select("blog_id, interaction_type, created_at")
        .eq("user_id", uid)
        .gte("created_at", since)
        .execute()
    )

    # blog_id별 교류 횟수 + 최근 교류 여부
    interaction_counts: dict[str, int] = {}
    recent_interaction: dict[str, bool] = {}
    recent_threshold = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    for row in (interactions_result.data or []):
        bid = row["blog_id"]
        interaction_counts[bid] = interaction_counts.get(bid, 0) + 1
        if row["created_at"] >= recent_threshold:
            recent_interaction[bid] = True

    # 6. 점수 계산
    scored: list[dict] = []
    skipped = 0

    for c in candidates:
        bid = c["blog_id"]

        # 이미 추천됨 또는 이미 신청함 → 스킵
        if bid in existing_ids or bid in requested_ids:
            skipped += 1
            continue

        score = _BASE_SCORE

        # 교류 빈도 점수
        interactions = interaction_counts.get(bid, 0)
        score += interactions * _INTERACTION_WEIGHT

        # 최근 교류 보너스
        if recent_interaction.get(bid):
            score += _RECENCY_BONUS

        # 테마 매칭 보너스
        candidate_category = (c.get("category") or "").lower()
        theme_matched = any(
            theme in candidate_category or candidate_category in theme
            for theme in user_themes
        ) if user_themes and candidate_category else False

        if theme_matched:
            score += _THEME_MATCH_BONUS

        # 추천 이유 생성
        reasons = []
        if interactions > 0:
            reasons.append(f"최근 30일 교류 {interactions}회")
        if theme_matched:
            reasons.append(f"테마 일치 ({candidate_category})")
        if not reasons:
            reasons.append("새로 발견된 이웃 후보")

        scored.append({
            "user_id": uid,
            "blog_id": bid,
            "blog_name": c.get("blog_name"),
            "category": c.get("category"),
            "reason": " · ".join(reasons),
            "score": round(score, 1),
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # 7. 점수순 정렬 → 상위 N개 저장
    scored.sort(key=lambda x: x["score"], reverse=True)
    to_save = scored[:max_recommendations]

    if to_save:
        sb.table("neighbor_recommendations").insert(to_save).execute()
        logger.info(f"이웃 추천 {len(to_save)}건 생성 (스킵 {skipped}건)")

    return {
        "generated": len(to_save),
        "skipped": skipped,
        "message": f"추천 {len(to_save)}건 생성 완료",
    }

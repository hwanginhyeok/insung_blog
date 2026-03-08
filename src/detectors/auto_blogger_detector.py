"""
오토 블로거(자동화된 댓글 봇 사용자) 감지 모듈

감지 기준:
  1. 패턴 기반 - 템플릿/반복적 문구 사용
  2. 시간 기반 - 비정상적으로 빠른 답글 (1분 내)
  3. 빈도 기반 - 과도한 댓글 활동

사용 흐름:
  1. 댓글 작성 후 답글 수집
  2. analyze_reply_pattern()로 패턴 분석
  3. is_auto_blogger()로 판단
"""
import re
from collections import Counter

from src.storage.database import (
    get_blogger_suspicion_score,
    get_recent_comments_for_blogger,
    record_blogger_reply,
    should_skip_blogger,
    update_blogger_pattern_score,
)
from src.utils.logger import logger

# 오토 블로거 패턴 (정규식)
_AUTO_PATTERNS = [
    # 템플릿 인사말
    r"^안녕하세요[.!]?\s*\w*님",
    r"^반갑습니다[.!]?",
    # 반복적인 감사/인사
    r"좋은\s*(글|포스팅|내용)",
    r"잘\s*보고\s*갑니다",
    r"소통\s*하고\s*갑니다",
    r"서로\s*(소통|공감|방문)",
    # 자동화 느낌 문구
    r"댓글\s*남기고\s*갑니다",
    r"인사\s*드리고\s*갑니다",
    r"방문\s*하고\s*갑니다",
    r"구독하고\s*갑니다",
]

# 금칙어/스팸 패턴
_SPAM_INDICATORS = [
    "http://",
    "https://",
    "상위노출",
    "검색순위",
    "블로그체험단",
    "체험단모집",
    "원고료",
    "협찬문의",
]


def _calculate_pattern_score(comments: list[str]) -> int:
    """
    댓글 내용의 패턴 일치 점수 계산 (0-100)
    """
    if not comments:
        return 0

    score = 0
    total = len(comments)

    # 1. 템플릿 패턴 일치 비율 (최대 40점)
    pattern_matches = 0
    for comment in comments:
        for pattern in _AUTO_PATTERNS:
            if re.search(pattern, comment, re.IGNORECASE):
                pattern_matches += 1
                break
    pattern_ratio = pattern_matches / total
    score += int(pattern_ratio * 40)

    # 2. 중복 문구 비율 (최대 30점)
    if total >= 2:
        # 모든 댓글 쌍 간 유사도 체크
        similarity_scores = []
        for i in range(total):
            for j in range(i + 1, total):
                sim = _text_similarity(comments[i], comments[j])
                similarity_scores.append(sim)
        
        if similarity_scores:
            avg_similarity = sum(similarity_scores) / len(similarity_scores)
            # 유사도가 높을수록 의심
            score += int(min(30, avg_similarity * 30))

    # 3. 길이 패턴 (최대 15점)
    # 오토 블로거는 비슷한 길이의 댓글을 많이 작성
    lengths = [len(c) for c in comments]
    if lengths:
        avg_len = sum(lengths) / len(lengths)
        variance = sum((l - avg_len) ** 2 for l in lengths) / len(lengths)
        std_dev = variance ** 0.5
        
        # 표준편차가 작을수록 (길이가 일정할수록) 의심
        if avg_len > 0:
            consistency = max(0, 1 - (std_dev / avg_len))
            score += int(consistency * 15)

    # 4. 스팸 지표 (최대 15점)
    spam_count = 0
    for comment in comments:
        for indicator in _SPAM_INDICATORS:
            if indicator.lower() in comment.lower():
                spam_count += 1
                break
    score += int(min(15, spam_count * 5))

    return min(100, score)


def _text_similarity(text1: str, text2: str) -> float:
    """
    두 텍스트 간 유사도 계산 (0.0 ~ 1.0)
    간단한 n-gram 기반 Jaccard 유사도
    """
    def get_ngrams(text: str, n: int = 2) -> set:
        text = re.sub(r"\s+", "", text.lower())
        return set(text[i:i+n] for i in range(len(text) - n + 1))
    
    ngrams1 = get_ngrams(text1)
    ngrams2 = get_ngrams(text2)
    
    if not ngrams1 or not ngrams2:
        return 0.0
    
    intersection = len(ngrams1 & ngrams2)
    union = len(ngrams1 | ngrams2)
    
    return intersection / union if union > 0 else 0.0


def analyze_reply_pattern(blog_id: str, reply_text: str, reply_time_seconds: int) -> int:
    """
    블로거의 답글 패턴을 분석하고 의심 점수 반환
    
    Args:
        blog_id: 블로거 ID
        reply_text: 답글 내용
        reply_time_seconds: 내 댓글 후 답글까지 걸린 시간(초)
    
    Returns:
        의심 점수 (0-100)
    """
    # 1. 답글 기록 저장
    record_blogger_reply(blog_id, reply_time_seconds, reply_text)
    
    # 2. 최근 댓글 수집 (최근 30일)
    recent_comments = get_recent_comments_for_blogger(blog_id, days=30)
    
    # 현재 답글도 포함
    all_comments = recent_comments + [reply_text]
    
    # 3. 패턴 점수 계산 (3개 이상 댓글 필요)
    if len(all_comments) >= 3:
        pattern_score = _calculate_pattern_score(all_comments)
        update_blogger_pattern_score(blog_id, pattern_score)
        
        logger.debug(
            f"[오토 감지] {blog_id}: 패턴 점수={pattern_score}, "
            f"댓글 수={len(all_comments)}, 답글 시간={reply_time_seconds}초"
        )
        return get_blogger_suspicion_score(blog_id)
    
    # 데이터 부족 시 기본 점수만 반환
    return get_blogger_suspicion_score(blog_id)


def is_auto_blogger(blog_id: str) -> tuple[bool, int, str]:
    """
    오토 블로거 여부 판단
    
    Returns:
        (is_auto, score, reason)
        - is_auto: True면 댓글 작성 제외 대상
        - score: 의심 점수 (0-100)
        - reason: 판단 이유
    """
    should_skip, reason = should_skip_blogger(blog_id)
    score = get_blogger_suspicion_score(blog_id)
    
    if should_skip:
        logger.info(f"[오토 블로거] {blog_id} 스킵 - {reason}")
        return True, score, reason
    
    return False, score, ""


def get_auto_blogger_report(days: int = 30) -> dict:
    """
    오토 블로거 감지 리포트 생성
    
    Returns:
        {
            "high_risk": [...],  # 70점 이상
            "medium_risk": [...],  # 40-69점
            "stats": {...}
        }
    """
    from src.storage.database import get_blogger_behavior_stats
    
    stats = get_blogger_behavior_stats(days)
    
    high_risk = []
    medium_risk = []
    
    for row in stats:
        score = get_blogger_suspicion_score(row["blog_id"])
        entry = {
            "blog_id": row["blog_id"],
            "score": score,
            "fast_replies": row["fast_reply_count"],
            "total_replies": row["total_replies"],
        }
        
        if score >= 70:
            high_risk.append(entry)
        elif score >= 40:
            medium_risk.append(entry)
    
    return {
        "high_risk": high_risk,
        "medium_risk": medium_risk,
        "stats": {
            "total_tracked": len(stats),
            "high_risk_count": len(high_risk),
            "medium_risk_count": len(medium_risk),
        },
    }

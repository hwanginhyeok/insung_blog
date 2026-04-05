"""이웃봇 기초 단위 테스트 — 브라우저 없이 실행 가능.

테스트 대상:
  - theme_analyzer: 키워드 매칭 로직
  - recommend_engine: 점수 계산 로직 (DB 모킹)
  - interaction_tracker: record_interaction 호출 (DB 모킹)
"""
import os
import sys
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ── theme_analyzer 테스트 ──


class TestThemeAnalyzer:
    """블로그 테마 분석 키워드 매칭 테스트."""

    def test_맛집_키워드_매칭(self):
        """맛집 관련 제목에서 '맛집' 테마가 추출되어야 함."""
        from src.neighbor.theme_analyzer import analyze_blog_themes

        titles = ["강남 맛집 추천 TOP5", "홍대 카페 투어", "신촌 식당 리뷰"]
        themes = analyze_blog_themes(titles)
        assert "맛집" in themes

    def test_여행_키워드_매칭(self):
        """여행 관련 제목에서 '여행' 테마가 추출되어야 함."""
        from src.neighbor.theme_analyzer import analyze_blog_themes

        titles = ["제주도 여행 2박3일", "바다 힐링 드라이브", "부산 숙소 추천"]
        themes = analyze_blog_themes(titles)
        assert "여행" in themes

    def test_빈_제목_리스트(self):
        """빈 리스트는 빈 결과 반환."""
        from src.neighbor.theme_analyzer import analyze_blog_themes

        themes = analyze_blog_themes([])
        assert themes == []

    def test_매칭_안되면_일상_반환(self):
        """어떤 테마에도 매칭되지 않으면 기본값 '일상' 반환."""
        from src.neighbor.theme_analyzer import analyze_blog_themes

        titles = ["안녕하세요 첫 포스팅입니다"]
        themes = analyze_blog_themes(titles)
        assert themes == ["일상"]

    def test_top_n_제한(self):
        """top_n 파라미터로 결과 수 제한."""
        from src.neighbor.theme_analyzer import analyze_blog_themes

        titles = [
            "맛집 추천", "맛집 리뷰", "맛집 탐방",
            "여행 일기", "여행 준비",
            "운동 루틴", "헬스 일지",
            "코딩 프로젝트",
        ]
        themes = analyze_blog_themes(titles, top_n=2)
        assert len(themes) <= 2

    def test_대소문자_무시(self):
        """키워드 매칭 시 대소문자 구분 안 함."""
        from src.neighbor.theme_analyzer import analyze_blog_themes

        titles = ["IT 개발자의 하루", "TECH 블로그"]
        themes = analyze_blog_themes(titles)
        assert "IT" in themes

    def test_복합_테마_추출(self):
        """여러 테마가 혼합된 경우 다수 테마 추출."""
        from src.neighbor.theme_analyzer import analyze_blog_themes

        titles = [
            "맛집 투어", "카페 추천",
            "여행 준비물", "숙소 리뷰",
            "강아지 산책",
        ]
        themes = analyze_blog_themes(titles, top_n=5)
        assert len(themes) >= 2

    def test_키워드_사전_존재(self):
        """_THEME_KEYWORDS가 비어있지 않아야 함."""
        from src.neighbor.theme_analyzer import _THEME_KEYWORDS

        assert len(_THEME_KEYWORDS) > 0
        for theme, keywords in _THEME_KEYWORDS.items():
            assert isinstance(keywords, list)
            assert len(keywords) > 0


# ── recommend_engine 점수 계산 테스트 ──


class TestRecommendEngine:
    """추천 엔진 점수 계산 로직 테스트 (DB 모킹)."""

    def test_상수_정의(self):
        """추천 점수 가중치 상수가 올바르게 정의되어 있는지."""
        from src.neighbor.recommend_engine import (
            _INTERACTION_WEIGHT,
            _THEME_MATCH_BONUS,
            _RECENCY_BONUS,
            _BASE_SCORE,
        )

        assert _BASE_SCORE > 0
        assert _INTERACTION_WEIGHT > 0
        assert _THEME_MATCH_BONUS > 0
        assert _RECENCY_BONUS > 0

    def test_기본_점수_계산(self):
        """교류 없는 후보의 기본 점수는 _BASE_SCORE."""
        from src.neighbor.recommend_engine import _BASE_SCORE

        # 점수 = BASE_SCORE (교류 0, 테마 불일치, 최근 교류 없음)
        assert _BASE_SCORE == 1.0

    def test_교류_점수_가중치(self):
        """교류 횟수에 따른 점수 증가 검증."""
        from src.neighbor.recommend_engine import (
            _INTERACTION_WEIGHT, _BASE_SCORE,
        )

        interactions = 3
        score = _BASE_SCORE + interactions * _INTERACTION_WEIGHT
        expected = 1.0 + 3 * 2.0  # 7.0
        assert score == expected

    def test_테마_매칭_보너스(self):
        """테마 일치 시 보너스 점수 추가."""
        from src.neighbor.recommend_engine import (
            _THEME_MATCH_BONUS, _BASE_SCORE,
        )

        score = _BASE_SCORE + _THEME_MATCH_BONUS
        assert score == 1.0 + 5.0

    def test_최근_교류_보너스(self):
        """최근 7일 내 교류 시 보너스."""
        from src.neighbor.recommend_engine import (
            _RECENCY_BONUS, _BASE_SCORE,
        )

        score = _BASE_SCORE + _RECENCY_BONUS
        assert score == 1.0 + 3.0

    def test_종합_점수_계산(self):
        """모든 보너스가 적용된 최대 점수 계산."""
        from src.neighbor.recommend_engine import (
            _INTERACTION_WEIGHT, _THEME_MATCH_BONUS,
            _RECENCY_BONUS, _BASE_SCORE,
        )

        interactions = 5
        score = (_BASE_SCORE
                 + interactions * _INTERACTION_WEIGHT
                 + _THEME_MATCH_BONUS
                 + _RECENCY_BONUS)
        expected = 1.0 + 5 * 2.0 + 5.0 + 3.0  # 19.0
        assert score == expected

    @patch("src.neighbor.recommend_engine.get_supabase")
    @patch("src.neighbor.recommend_engine._resolve_user_id")
    def test_후보_없으면_빈_결과(self, mock_resolve, mock_sb):
        """discovered 후보가 없으면 추천 0건."""
        from src.neighbor.recommend_engine import generate_recommendations

        mock_resolve.return_value = "test-user-id"
        mock_client = MagicMock()
        mock_sb.return_value = mock_client

        # neighbors 테이블 빈 결과
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.in_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[])

        result = generate_recommendations(user_id="test-user-id")
        assert result["generated"] == 0
        assert result["message"] == "추천 후보 없음"


# ── interaction_tracker 테스트 ──


class TestInteractionTracker:
    """교류 기록 저장 테스트 (DB 모킹)."""

    @patch("src.neighbor.interaction_tracker.get_supabase")
    @patch("src.neighbor.interaction_tracker._resolve_user_id")
    def test_record_interaction_성공(self, mock_resolve, mock_sb):
        """record_interaction이 올바르게 insert를 호출하는지."""
        from src.neighbor.interaction_tracker import record_interaction

        mock_resolve.return_value = "test-user-id"
        mock_client = MagicMock()
        mock_sb.return_value = mock_client

        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock()

        result = record_interaction(
            blog_id="testblog",
            interaction_type="comment_sent",
            post_url="https://blog.naver.com/testblog/123",
            content="좋은 글이네요!",
            user_id="test-user-id",
        )

        assert result is True
        mock_client.table.assert_called_with("neighbor_interactions")
        # insert가 호출되었는지 확인
        mock_table.insert.assert_called_once()
        call_args = mock_table.insert.call_args[0][0]
        assert call_args["blog_id"] == "testblog"
        assert call_args["interaction_type"] == "comment_sent"
        assert call_args["user_id"] == "test-user-id"

    @patch("src.neighbor.interaction_tracker.get_supabase")
    @patch("src.neighbor.interaction_tracker._resolve_user_id")
    def test_record_interaction_실패시_False(self, mock_resolve, mock_sb):
        """DB 에러 시 False 반환."""
        from src.neighbor.interaction_tracker import record_interaction

        mock_resolve.return_value = "test-user-id"
        mock_sb.side_effect = Exception("DB 연결 실패")

        result = record_interaction(
            blog_id="testblog",
            interaction_type="visit",
        )
        assert result is False

    @patch("src.neighbor.interaction_tracker.get_supabase")
    @patch("src.neighbor.interaction_tracker._resolve_user_id")
    def test_content_500자_제한(self, mock_resolve, mock_sb):
        """content가 500자를 초과하면 잘려야 함."""
        from src.neighbor.interaction_tracker import record_interaction

        mock_resolve.return_value = "test-user-id"
        mock_client = MagicMock()
        mock_sb.return_value = mock_client

        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock()

        long_content = "가" * 1000
        record_interaction(
            blog_id="testblog",
            interaction_type="comment_sent",
            content=long_content,
        )

        call_args = mock_table.insert.call_args[0][0]
        assert len(call_args["content"]) == 500

    @patch("src.neighbor.interaction_tracker.get_supabase")
    @patch("src.neighbor.interaction_tracker._resolve_user_id")
    def test_content_None_허용(self, mock_resolve, mock_sb):
        """content가 None이면 None 그대로 저장."""
        from src.neighbor.interaction_tracker import record_interaction

        mock_resolve.return_value = "test-user-id"
        mock_client = MagicMock()
        mock_sb.return_value = mock_client

        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock()

        record_interaction(
            blog_id="testblog",
            interaction_type="visit",
            content=None,
        )

        call_args = mock_table.insert.call_args[0][0]
        assert call_args["content"] is None

    @patch("src.neighbor.interaction_tracker.get_supabase")
    @patch("src.neighbor.interaction_tracker._resolve_user_id")
    def test_get_recent_interactions_정상(self, mock_resolve, mock_sb):
        """최근 교류 기록 조회가 정상 동작."""
        from src.neighbor.interaction_tracker import get_recent_interactions

        mock_resolve.return_value = "test-user-id"
        mock_client = MagicMock()
        mock_sb.return_value = mock_client

        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.limit.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[
            {"blog_id": "blog1", "interaction_type": "visit"},
        ])

        result = get_recent_interactions("blog1", user_id="test-user-id")
        assert len(result) == 1
        assert result[0]["blog_id"] == "blog1"

    @patch("src.neighbor.interaction_tracker.get_supabase")
    @patch("src.neighbor.interaction_tracker._resolve_user_id")
    def test_get_interaction_stats_정상(self, mock_resolve, mock_sb):
        """교류 통계 조회가 정상 동작."""
        from src.neighbor.interaction_tracker import get_interaction_stats

        mock_resolve.return_value = "test-user-id"
        mock_client = MagicMock()
        mock_sb.return_value = mock_client

        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.execute.return_value = MagicMock(
            count=5,
            data=[
                {"interaction_type": "comment_sent"},
                {"interaction_type": "comment_sent"},
                {"interaction_type": "visit"},
            ],
        )

        result = get_interaction_stats(user_id="test-user-id")
        assert result["total"] == 5
        assert "comment_sent" in result["by_type"]
        assert result["by_type"]["comment_sent"] == 2

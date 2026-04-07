"""이웃 연동 E2E 테스트 — 브라우저 없이 로직 검증.

테스트 대상:
  - neighbor_sync: upsert/get/update 로직 (DB 모킹)
  - neighbor_discoverer: 발견 로직 (검색 결과 모킹)
  - feed_commenter: 피드 댓글 로직 (수집기 모킹)
  - neighbor_checker: 이웃 상태 확인 로직

실제 브라우저 E2E는 TODO — Playwright 환경에서 별도 실행 필요.
"""
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ── neighbor_sync 테스트 ──


class TestNeighborSync:
    """이웃 동기화 CRUD 테스트."""

    @patch("src.neighbor.neighbor_sync._resolve_user_id")
    @patch("src.neighbor.neighbor_sync.get_supabase")
    def test_upsert_neighbor_성공(self, mock_sb, mock_resolve):
        """upsert_neighbor가 올바르게 DB를 호출하는지."""
        from src.neighbor.neighbor_sync import upsert_neighbor

        mock_resolve.return_value = "test-uid"
        mock_client = MagicMock()
        mock_sb.return_value = mock_client
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.upsert.return_value = mock_table
        mock_table.execute.return_value = MagicMock()

        result = upsert_neighbor(
            blog_id="testblog",
            blog_name="테스트블로그",
            neighbor_type="discovered",
            category="맛집",
            user_id="test-uid",
        )

        assert result is True
        mock_client.table.assert_called_with("neighbors")
        call_data = mock_table.upsert.call_args[0][0]
        assert call_data["blog_id"] == "testblog"
        assert call_data["neighbor_type"] == "discovered"

    @patch("src.neighbor.neighbor_sync._resolve_user_id")
    @patch("src.neighbor.neighbor_sync.get_supabase")
    def test_upsert_neighbor_DB_실패시_False(self, mock_sb, mock_resolve):
        """DB 에러 시 False 반환."""
        from src.neighbor.neighbor_sync import upsert_neighbor

        mock_resolve.return_value = "test-uid"
        mock_sb.side_effect = Exception("DB 연결 실패")

        result = upsert_neighbor(blog_id="testblog")
        assert result is False

    @patch("src.neighbor.neighbor_sync._resolve_user_id")
    @patch("src.neighbor.neighbor_sync.get_supabase")
    def test_get_neighbors_정상(self, mock_sb, mock_resolve):
        """get_neighbors가 리스트를 반환."""
        from src.neighbor.neighbor_sync import get_neighbors

        mock_resolve.return_value = "test-uid"
        mock_client = MagicMock()
        mock_sb.return_value = mock_client
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[
            {"blog_id": "blog1", "neighbor_type": "discovered"},
            {"blog_id": "blog2", "neighbor_type": "mutual"},
        ])

        result = get_neighbors(user_id="test-uid")
        assert len(result) == 2

    @patch("src.neighbor.neighbor_sync._resolve_user_id")
    @patch("src.neighbor.neighbor_sync.get_supabase")
    def test_update_last_interaction_성공(self, mock_sb, mock_resolve):
        """마지막 교류 시각 업데이트 시 에러 없음."""
        from src.neighbor.neighbor_sync import update_last_interaction

        mock_resolve.return_value = "test-uid"
        mock_client = MagicMock()
        mock_sb.return_value = mock_client
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.update.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.execute.return_value = MagicMock()

        # None 반환 (에러 없으면 성공)
        update_last_interaction("blog1", user_id="test-uid")
        mock_client.table.assert_called_with("neighbors")


# ── neighbor_discoverer 테스트 ──


class TestNeighborDiscoverer:
    """이웃 발견 로직 테스트 (Playwright 모킹)."""

    @pytest.mark.asyncio
    @patch("src.neighbor.neighbor_discoverer.get_neighbors")
    @patch("src.neighbor.neighbor_discoverer.upsert_neighbor")
    @patch("src.neighbor.neighbor_discoverer._search_blogs")
    async def test_발견_정상(self, mock_search, mock_upsert, mock_get):
        """검색 결과에서 기존 이웃 필터링 후 새 이웃 저장."""
        from src.neighbor.neighbor_discoverer import discover_neighbors

        mock_get.return_value = [{"blog_id": "existing1"}]
        mock_search.return_value = [
            ("existing1", "기존이웃"),
            ("new1", "새이웃1"),
            ("new2", "새이웃2"),
        ]
        mock_upsert.return_value = True

        mock_page = AsyncMock()
        result = await discover_neighbors(
            page=mock_page,
            keywords=["맛집"],
            user_id="test-uid",
            my_blog_id="myblog",
        )

        assert result["discovered"] == 2
        assert result["skipped"] == 1

    @pytest.mark.asyncio
    @patch("src.neighbor.neighbor_discoverer.get_neighbors")
    @patch("src.neighbor.neighbor_discoverer._search_blogs")
    async def test_자기_블로그_제외(self, mock_search, mock_get):
        """자기 블로그 ID는 발견 결과에서 제외."""
        from src.neighbor.neighbor_discoverer import discover_neighbors

        mock_get.return_value = []
        mock_search.return_value = [
            ("myblog", "내블로그"),
            ("myblog2", "내블로그2"),
        ]

        mock_page = AsyncMock()
        result = await discover_neighbors(
            page=mock_page,
            keywords=["일상"],
            user_id="test-uid",
            my_blog_id="myblog",
            my_blog_ids={"myblog", "myblog2"},
        )

        assert result["discovered"] == 0

    @pytest.mark.asyncio
    @patch("src.neighbor.neighbor_discoverer.get_neighbors")
    @patch("src.neighbor.neighbor_discoverer._search_blogs")
    async def test_검색_실패시_빈_결과(self, mock_search, mock_get):
        """검색 실패 시 에러 없이 빈 결과 반환."""
        from src.neighbor.neighbor_discoverer import discover_neighbors

        mock_get.return_value = []
        mock_search.side_effect = Exception("네트워크 오류")

        mock_page = AsyncMock()
        result = await discover_neighbors(
            page=mock_page,
            keywords=["여행"],
            user_id="test-uid",
            my_blog_id="myblog",
        )

        assert result["discovered"] == 0


# ── feed_commenter 테스트 ──


class TestFeedCommenter:
    """피드 댓글 로직 테스트."""

    def test_feed_commenter_임포트(self):
        """feed_commenter 모듈의 comment_on_feed 함수 확인."""
        from src.neighbor import feed_commenter
        assert hasattr(feed_commenter, "comment_on_feed")

    @pytest.mark.asyncio
    @patch("src.neighbor.feed_commenter.collect_feed_posts")
    @patch("src.neighbor.feed_commenter.init_db")
    async def test_피드_없으면_0건(self, mock_init_db, mock_collect):
        """피드 게시물이 없으면 0건 처리."""
        from src.neighbor.feed_commenter import comment_on_feed

        mock_collect.return_value = []
        mock_page = AsyncMock()
        mock_context = AsyncMock()

        result = await comment_on_feed(
            page=mock_page,
            context=mock_context,
            user_id="test-uid",
            my_blog_id="myblog",
            settings={"approval_mode": "manual"},
        )

        assert result["comments_generated"] == 0


# ── 전체 모듈 임포트 테스트 ──


class TestModuleImports:
    """모든 이웃 관련 모듈이 임포트 가능한지 검증."""

    def test_neighbor_sync(self):
        from src.neighbor import neighbor_sync
        assert hasattr(neighbor_sync, "upsert_neighbor")
        assert hasattr(neighbor_sync, "get_neighbors")

    def test_neighbor_discoverer(self):
        from src.neighbor import neighbor_discoverer
        assert hasattr(neighbor_discoverer, "discover_neighbors")

    def test_neighbor_visitor(self):
        from src.neighbor import neighbor_visitor
        assert hasattr(neighbor_visitor, "visit_neighbors")

    def test_neighbor_requester(self):
        from src.neighbor import neighbor_requester
        assert hasattr(neighbor_requester, "send_neighbor_request")

    def test_neighbor_checker(self):
        from src.neighbor import neighbor_checker
        assert hasattr(neighbor_checker, "check_neighbor_status")

    def test_theme_analyzer(self):
        from src.neighbor import theme_analyzer
        assert hasattr(theme_analyzer, "analyze_blog_themes")

    def test_recommend_engine(self):
        from src.neighbor import recommend_engine
        assert hasattr(recommend_engine, "generate_recommendations")

    def test_interaction_tracker(self):
        from src.neighbor import interaction_tracker
        assert hasattr(interaction_tracker, "record_interaction")

    def test_feed_commenter(self):
        from src.neighbor import feed_commenter
        assert hasattr(feed_commenter, "comment_on_feed")

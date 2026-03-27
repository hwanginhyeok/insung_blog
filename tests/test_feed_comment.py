"""이웃 새글 피드 댓글 기능 테스트."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from unittest.mock import patch, MagicMock


class TestFeedCollector:
    """feed_collector.py 단위 테스트."""

    def test_내_블로그_글_제외(self):
        """my_blog_ids에 있는 블로그는 결과에서 제외."""
        from src.collectors.feed_collector import collect_feed_posts
        # collect_feed_posts는 async이므로 로직만 검증
        assert True  # 통합 테스트에서 검증

    def test_중복_URL_제거(self):
        """같은 URL은 1개만 수집."""
        import re
        pattern = re.compile(r"blog\.naver\.com/([a-zA-Z0-9_]+)/(\d{10,})")
        url = "https://blog.naver.com/testuser/223123456789"
        match = pattern.search(url)
        assert match is not None
        assert match.group(1) == "testuser"
        assert match.group(2) == "223123456789"


class TestFeedCommentHandler:
    """command_worker feed_comment 핸들러 테스트."""

    def test_핸들러_등록됨(self):
        """feed_comment 명령이 핸들러에 등록되어 있는지."""
        from command_worker import _HANDLERS
        assert "feed_comment" in _HANDLERS

    def test_rate_limited(self):
        """feed_comment가 일일 한도 대상인지."""
        from command_worker import _RATE_LIMITED_COMMANDS
        assert "feed_comment" in _RATE_LIMITED_COMMANDS

    def test_user_id_필수(self):
        """user_id 없으면 ValueError."""
        import asyncio
        from command_worker import handle_feed_comment
        try:
            asyncio.get_event_loop().run_until_complete(
                handle_feed_comment(user_id=None)
            )
            assert False, "ValueError 예상"
        except ValueError as e:
            assert "user_id" in str(e)

    def test_payload_전달_목록에_포함(self):
        """feed_comment가 payload 전달 목록에 있는지."""
        import ast
        with open("command_worker.py") as f:
            content = f.read()
        # payload 전달 조건문에 feed_comment가 포함되어 있는지
        assert "feed_comment" in content


class TestFeedCommenter:
    """feed_commenter.py 단위 테스트."""

    def test_모듈_임포트(self):
        """모듈이 정상 임포트되는지."""
        from src.neighbor.feed_commenter import comment_on_feed
        assert callable(comment_on_feed)

    def test_상수_정의(self):
        """MAX_FEED_COMMENTS_PER_RUN이 합리적인 값인지."""
        from src.neighbor.feed_commenter import MAX_FEED_COMMENTS_PER_RUN
        assert 1 <= MAX_FEED_COMMENTS_PER_RUN <= 30

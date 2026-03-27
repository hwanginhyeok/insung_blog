"""유저별 일일 댓글봇 한도 테스트.

check_daily_bot_limit() 함수 + command_worker의 한도 차단 로직 검증.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from unittest.mock import patch, MagicMock


class TestCheckDailyBotLimit:
    """check_daily_bot_limit() 단위 테스트."""

    def test_유저없으면_무제한_허용(self):
        """user_id=None이면 항상 허용."""
        from command_worker import check_daily_bot_limit
        result = check_daily_bot_limit(None)
        assert result["allowed"] is True
        assert result["limit"] == 999

    @patch("command_worker.get_supabase")
    def test_한도_내_허용(self, mock_sb):
        """한도 내 실행은 허용."""
        mock_rpc = MagicMock()
        mock_rpc.execute.return_value = MagicMock(
            data={"allowed": True, "used": 5, "limit": 30, "remaining": 25}
        )
        mock_sb.return_value.rpc.return_value = mock_rpc

        from command_worker import check_daily_bot_limit
        result = check_daily_bot_limit("test-user-id")
        assert result["allowed"] is True
        assert result["remaining"] == 25

    @patch("command_worker.get_supabase")
    def test_한도_초과_차단(self, mock_sb):
        """한도 초과 시 차단."""
        mock_rpc = MagicMock()
        mock_rpc.execute.return_value = MagicMock(
            data={"allowed": False, "used": 30, "limit": 30, "remaining": 0}
        )
        mock_sb.return_value.rpc.return_value = mock_rpc

        from command_worker import check_daily_bot_limit
        result = check_daily_bot_limit("test-user-id")
        assert result["allowed"] is False
        assert result["remaining"] == 0

    @patch("command_worker.get_supabase")
    def test_rpc_실패시_허용_폴백(self, mock_sb):
        """RPC 호출 실패 시 서비스 중단 방지를 위해 허용."""
        mock_sb.return_value.rpc.side_effect = Exception("DB 연결 실패")

        from command_worker import check_daily_bot_limit
        result = check_daily_bot_limit("test-user-id")
        assert result["allowed"] is True


class TestRateLimitedCommands:
    """_RATE_LIMITED_COMMANDS 매핑 검증."""

    def test_run_명령은_한도_적용(self):
        from command_worker import _RATE_LIMITED_COMMANDS
        assert "run" in _RATE_LIMITED_COMMANDS

    def test_execute_명령은_한도_적용(self):
        from command_worker import _RATE_LIMITED_COMMANDS
        assert "execute" in _RATE_LIMITED_COMMANDS

    def test_publish_명령은_한도_미적용(self):
        """발행은 Playwright 안 쓰므로 한도 미적용."""
        from command_worker import _RATE_LIMITED_COMMANDS
        assert "publish" not in _RATE_LIMITED_COMMANDS

    def test_extract_blog_id_한도_미적용(self):
        """블로그 ID 추출은 한도 미적용."""
        from command_worker import _RATE_LIMITED_COMMANDS
        assert "extract_blog_id" not in _RATE_LIMITED_COMMANDS


class TestProcessCommandWithLimit:
    """process_command()의 한도 차단 통합 테스트."""

    @pytest.mark.asyncio
    @patch("command_worker.check_daily_bot_limit")
    @patch("command_worker.mark_failed")
    async def test_한도_초과시_명령_차단(self, mock_mark_failed, mock_check):
        """한도 초과 시 handler를 호출하지 않고 바로 실패 처리."""
        mock_check.return_value = {
            "allowed": False, "used": 30, "limit": 30, "remaining": 0
        }

        from command_worker import process_command
        cmd = {
            "id": "test-cmd-id-12345678",
            "command": "run",
            "user_id": "test-user-12345678",
        }

        await process_command(cmd)

        # mark_failed가 호출되었는지 확인
        mock_mark_failed.assert_called_once()
        call_args = mock_mark_failed.call_args
        assert "한도 초과" in call_args[0][1]

    @pytest.mark.asyncio
    @patch("command_worker.check_daily_bot_limit")
    @patch("command_worker.mark_completed")
    @patch("command_worker._HANDLERS", {"publish": lambda **kw: {"message": "ok"}})
    async def test_publish는_한도_체크_안함(self, mock_mark_completed, mock_check):
        """publish 명령은 한도 체크를 건너뜀."""
        from command_worker import process_command
        cmd = {
            "id": "test-cmd-id-12345678",
            "command": "publish",
            "user_id": "test-user-12345678",
            "payload": {},
        }

        await process_command(cmd)

        # check_daily_bot_limit가 호출되지 않아야 함
        mock_check.assert_not_called()

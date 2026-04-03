"""auto_execute / daily_discover 모드 단위 테스트.

handle_run의 auto_execute 경로:
  1. pending 있으면 → 자동 승인 + execute 큐
  2. pending 없으면 → execute 스킵
  3. Supabase 오류 → run은 completed (warning만)

daily_discover.py:
  4. 이미 pending run 있으면 → 스킵
  5. 대상 없으면 → 조기 반환
"""
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ── handle_run auto_execute 테스트 ──────────────────────────────────────


@pytest.mark.asyncio
@patch("command_worker._browser_semaphore")
@patch("command_worker.get_supabase")
async def test_auto_execute_pending_있으면_execute_큐(mock_sb, mock_sem):
    """auto_execute=True + pending N건 → 자동 승인 + execute 명령 큐 추가."""
    # _browser_semaphore는 async context manager로 동작
    mock_sem.__aenter__ = AsyncMock(return_value=None)
    mock_sem.__aexit__ = AsyncMock(return_value=False)

    fake_pending = [{"id": "c1"}, {"id": "c2"}]

    mock_insert = MagicMock()
    mock_insert.execute.return_value = MagicMock()
    mock_sb.return_value.table.return_value.insert.return_value = mock_insert

    with (
        # 함수 내 import 경로 패치 — supabase_client 모듈에서 직접
        patch("src.storage.supabase_client.get_bot_settings_sb", return_value={"auto_execute": True}),
        patch("src.storage.supabase_client.get_pending_comments_sb", return_value=fake_pending),
        patch("src.storage.supabase_client.update_pending_status_sb") as mock_update,
        patch("src.orchestrator.run", new_callable=AsyncMock),
    ):
        from command_worker import handle_run
        result = await handle_run(user_id="test-user-id-1234")

    assert result == {"message": "봇 실행 완료"}

    # 2개 댓글 모두 approved 처리됐는지
    assert mock_update.call_count == 2
    mock_update.assert_any_call("c1", "approved", decided_by="auto_execute")
    mock_update.assert_any_call("c2", "approved", decided_by="auto_execute")

    # execute 명령이 bot_commands에 insert됐는지
    mock_sb.return_value.table.assert_called_with("bot_commands")
    inserted = mock_sb.return_value.table.return_value.insert.call_args[0][0]
    assert inserted["command"] == "execute"
    assert inserted["status"] == "pending"


@pytest.mark.asyncio
@patch("command_worker._browser_semaphore")
@patch("command_worker.get_supabase")
async def test_auto_execute_pending_없으면_execute_스킵(mock_sb, mock_sem):
    """auto_execute=True + pending 0건 → execute 큐 추가 안 함."""
    mock_sem.__aenter__ = AsyncMock(return_value=None)
    mock_sem.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("src.storage.supabase_client.get_bot_settings_sb", return_value={"auto_execute": True}),
        patch("src.storage.supabase_client.get_pending_comments_sb", return_value=[]),
        patch("src.orchestrator.run", new_callable=AsyncMock),
    ):
        from command_worker import handle_run
        result = await handle_run(user_id="test-user-id-5678")

    assert result == {"message": "봇 실행 완료"}
    # bot_commands insert가 호출되지 않았는지
    mock_sb.return_value.table.return_value.insert.assert_not_called()


@pytest.mark.asyncio
@patch("command_worker._browser_semaphore")
async def test_auto_execute_supabase_오류시_run_완료(mock_sem):
    """auto_execute 블록에서 Supabase 오류가 나도 run은 '완료' 반환."""
    mock_sem.__aenter__ = AsyncMock(return_value=None)
    mock_sem.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("src.storage.supabase_client.get_bot_settings_sb", side_effect=RuntimeError("DB 연결 오류")),
        patch("src.orchestrator.run", new_callable=AsyncMock),
    ):
        from command_worker import handle_run
        result = await handle_run(user_id="test-user-id-9999")

    # Supabase 오류가 있어도 run 자체는 완료로 반환돼야 함
    assert result == {"message": "봇 실행 완료"}


# ── daily_discover.py 테스트 ─────────────────────────────────────────────


def _run_daily_discover_main(sb_mock):
    """daily_discover.main()을 직접 호출. supabase는 sb_mock 사용."""
    import sys
    import importlib.util
    from pathlib import Path

    # daily_discover.py 직접 로드 (스크립트 경로)
    spec = importlib.util.spec_from_file_location(
        "daily_discover_test",
        Path(__file__).parent.parent / "scripts" / "daily_discover.py",
    )
    mod = importlib.util.module_from_spec(spec)

    # get_supabase를 sb_mock 반환하도록 패치 후 main() 실행
    with patch("src.storage.supabase_client.get_supabase", return_value=sb_mock):
        spec.loader.exec_module(mod)
        mod.main()

    return mod, sb_mock


def test_daily_discover_이미_run_대기중이면_스킵():
    """이미 pending/running run이 있으면 insert 안 함."""
    sb = MagicMock()

    # bot_settings: user 1명 반환
    settings_result = MagicMock()
    settings_result.data = [{"user_id": "user-abc"}]

    # bot_commands: 이미 run 대기 중
    existing_result = MagicMock()
    existing_result.data = [{"id": "existing-cmd"}]

    # bot_commands insert 추적
    insert_exec = MagicMock()

    def table_side(name):
        t = MagicMock()
        if name == "bot_settings":
            # .select().eq().eq().not_.is_().execute() 체인
            chain = t.select.return_value
            chain.eq.return_value.eq.return_value.not_.is_.return_value.execute.return_value = settings_result
        elif name == "bot_commands":
            # select 체인 (중복 체크)
            chain = t.select.return_value
            chain.eq.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value = existing_result
            # insert
            t.insert.return_value = insert_exec
        return t

    sb.table.side_effect = table_side

    _run_daily_discover_main(sb)

    # insert가 호출되지 않았는지 — bot_commands에 대한 insert 없음
    insert_exec.execute.assert_not_called()


def test_daily_discover_대상_없으면_조기반환():
    """daily_discover=True 사용자 없으면 bot_commands insert 없음."""
    sb = MagicMock()

    # bot_settings: 사용자 0명
    settings_result = MagicMock()
    settings_result.data = []

    def table_side(name):
        t = MagicMock()
        if name == "bot_settings":
            chain = t.select.return_value
            chain.eq.return_value.eq.return_value.not_.is_.return_value.execute.return_value = settings_result
        return t

    sb.table.side_effect = table_side

    _run_daily_discover_main(sb)

    # bot_commands 테이블 자체를 접근하지 않았어야 함
    for call in sb.table.call_args_list:
        assert call[0][0] != "bot_commands", "대상 없으면 bot_commands 접근 안 함"

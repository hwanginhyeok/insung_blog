"""command_worker 핸들러 시그니처/검증 테스트"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from command_worker import (
    handle_recommend_neighbors,
    handle_sync_neighbors,
    handle_analyze_theme,
)


@pytest.mark.asyncio
async def test_recommend_neighbors_no_user_id():
    """user_id 없으면 ValueError"""
    with pytest.raises(ValueError, match="user_id가 필수"):
        await handle_recommend_neighbors(user_id=None)


@pytest.mark.asyncio
async def test_sync_neighbors_no_user_id():
    """user_id 없으면 ValueError"""
    with pytest.raises(ValueError, match="user_id가 필수"):
        await handle_sync_neighbors(user_id=None)


@pytest.mark.asyncio
async def test_analyze_theme_no_user_id():
    """user_id 없으면 ValueError"""
    with pytest.raises(ValueError, match="user_id가 필수"):
        await handle_analyze_theme(user_id=None)


def test_handlers_registered():
    """3개 핸들러가 _HANDLERS에 등록되었는지"""
    from command_worker import _HANDLERS
    assert "recommend_neighbors" in _HANDLERS
    assert "sync_neighbors" in _HANDLERS
    assert "analyze_theme" in _HANDLERS


def test_handler_signatures():
    """각 핸들러가 user_id, payload 파라미터를 받는지"""
    import inspect
    for handler in [handle_recommend_neighbors, handle_sync_neighbors, handle_analyze_theme]:
        sig = inspect.signature(handler)
        params = list(sig.parameters.keys())
        assert "user_id" in params, f"{handler.__name__}에 user_id 파라미터 없음"
        assert "payload" in params, f"{handler.__name__}에 payload 파라미터 없음"

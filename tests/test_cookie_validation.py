"""NID_AUT 쿠키 유실 방지 검증 테스트"""
import json
import os
import sys
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# NID_AUT 포함 쿠키
COOKIES_WITH_NID = [
    {"name": "NID_AUT", "value": "abc123", "domain": ".naver.com", "path": "/"},
    {"name": "NID_SES", "value": "def456", "domain": ".naver.com", "path": "/"},
    {"name": "JSESSIONID", "value": "ghi789", "domain": ".naver.com", "path": "/"},
]

# NID_AUT 없는 쿠키 (세션 쿠키 드롭 시나리오)
COOKIES_WITHOUT_NID = [
    {"name": "NID_SES", "value": "def456", "domain": ".naver.com", "path": "/"},
    {"name": "JSESSIONID", "value": "ghi789", "domain": ".naver.com", "path": "/"},
]


@pytest.mark.asyncio
async def test_save_cookies_for_user_with_nid_aut():
    """NID_AUT 포함 쿠키 → 정상 저장"""
    from src.auth.naver_login import _save_cookies_for_user

    context = AsyncMock()
    context.cookies.return_value = COOKIES_WITH_NID

    with tempfile.TemporaryDirectory() as tmpdir:
        user_id = "test1234-5678-abcd-efgh"
        cookie_path = os.path.join(tmpdir, f"{user_id[:8]}_naver.json")

        with patch("src.auth.naver_login.get_cookies_path") as mock_path:
            from pathlib import Path
            mock_path.return_value = Path(cookie_path)
            with patch("src.storage.supabase_client.save_bot_cookies_sb"):
                await _save_cookies_for_user(context, user_id)

        # 파일이 생성되었는지 확인
        assert os.path.exists(cookie_path), "쿠키 파일이 생성되어야 함"
        with open(cookie_path) as f:
            saved = json.load(f)
        assert len(saved) == 3
        assert any(c["name"] == "NID_AUT" for c in saved)


@pytest.mark.asyncio
async def test_save_cookies_for_user_without_nid_aut():
    """NID_AUT 미포함 쿠키 → 저장 스킵 (기존 쿠키 보호)"""
    from src.auth.naver_login import _save_cookies_for_user

    context = AsyncMock()
    context.cookies.return_value = COOKIES_WITHOUT_NID

    with tempfile.TemporaryDirectory() as tmpdir:
        user_id = "test1234-5678-abcd-efgh"
        cookie_path = os.path.join(tmpdir, f"{user_id[:8]}_naver.json")

        with patch("src.auth.naver_login.get_cookies_path") as mock_path:
            from pathlib import Path
            mock_path.return_value = Path(cookie_path)
            await _save_cookies_for_user(context, user_id)

        # 파일이 생성되지 않아야 함 (스킵)
        assert not os.path.exists(cookie_path), "NID_AUT 없으면 저장 스킵"


@pytest.mark.asyncio
async def test_save_cookies_for_user_empty():
    """빈 쿠키 → 저장 스킵"""
    from src.auth.naver_login import _save_cookies_for_user

    context = AsyncMock()
    context.cookies.return_value = []

    with tempfile.TemporaryDirectory() as tmpdir:
        user_id = "test1234-5678-abcd-efgh"
        cookie_path = os.path.join(tmpdir, f"{user_id[:8]}_naver.json")

        with patch("src.auth.naver_login.get_cookies_path") as mock_path:
            from pathlib import Path
            mock_path.return_value = Path(cookie_path)
            await _save_cookies_for_user(context, user_id)

        assert not os.path.exists(cookie_path), "빈 쿠키면 저장 스킵"

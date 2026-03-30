"""중복 댓글 방지 로직 테스트.

커버리지:
- _fill_and_submit: 입력창 cleared retry loop (3회 × 3초)
- _process_retry_queue: is_post_commented() 체크로 이미 완료된 포스트 스킵
- command_worker handle_execute: 성공 시 record_comment() 호출
- command_worker handle_execute: 연속 5회 실패 시 미처리 댓글 approved 롤백
"""
import os
import sys
import asyncio
import sqlite3
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call


# ─────────────────────────────────────────────────────────────────────────────
# _fill_and_submit — 입력창 cleared retry loop
# ─────────────────────────────────────────────────────────────────────────────

class TestFillAndSubmitInputClearedRetry:
    """_fill_and_submit() 제출 성공 감지 — retry loop."""

    def _make_frame(self):
        frame = MagicMock()
        frame.page = MagicMock()
        frame.query_selector = AsyncMock(return_value=None)
        return frame

    def _make_input_el(self):
        return MagicMock()

    @pytest.mark.asyncio
    async def test_즉시_cleared_성공(self):
        """제출 직후 입력창이 비워지면 True 반환."""
        from src.commenter.comment_writer import _fill_and_submit

        frame = self._make_frame()
        input_el = self._make_input_el()

        # 포커스/입력 성공
        input_el.evaluate = AsyncMock(side_effect=[
            True,    # is_contenteditable
            "",      # 첫 번째 확인: 비워짐
        ])
        frame.page.keyboard = MagicMock()
        frame.page.keyboard.type = AsyncMock()
        frame.wait_for_selector = AsyncMock(return_value=input_el)

        with patch("src.commenter.comment_writer._is_captcha_present", new_callable=AsyncMock, return_value=False), \
             patch("src.commenter.comment_writer._click_like_button", new_callable=AsyncMock), \
             patch("src.commenter.comment_writer.delay_short", new_callable=AsyncMock):
            # submit_btn
            submit_btn = MagicMock()
            submit_btn.evaluate = AsyncMock()
            frame.wait_for_selector = AsyncMock(return_value=submit_btn)

            # input_el evaluate: contenteditable=True, then text=""
            input_el.evaluate = AsyncMock(side_effect=[True, ""])

            result = await _fill_and_submit(frame, input_el, "테스트 댓글", dry_run=False)
        assert result is True

    @pytest.mark.asyncio
    async def test_2회_시도_후_cleared_성공(self):
        """입력창이 2회 확인 후 비워지면 True 반환."""
        from src.commenter.comment_writer import _fill_and_submit

        frame = self._make_frame()
        input_el = self._make_input_el()

        submit_btn = MagicMock()
        submit_btn.evaluate = AsyncMock()
        frame.wait_for_selector = AsyncMock(return_value=submit_btn)

        # contenteditable=True, 1회=미비워짐, 2회=비워짐
        input_el.evaluate = AsyncMock(side_effect=[True, "아직 있음", ""])

        with patch("src.commenter.comment_writer._is_captcha_present", new_callable=AsyncMock, return_value=False), \
             patch("src.commenter.comment_writer._click_like_button", new_callable=AsyncMock), \
             patch("src.commenter.comment_writer.delay_short", new_callable=AsyncMock), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            frame.page.keyboard = MagicMock()
            frame.page.keyboard.type = AsyncMock()
            result = await _fill_and_submit(frame, input_el, "테스트 댓글", dry_run=False)
        assert result is True

    @pytest.mark.asyncio
    async def test_3회_모두_미비워짐_실패(self):
        """3회 확인 후에도 입력창이 안 비워지면 False 반환."""
        from src.commenter.comment_writer import _fill_and_submit

        frame = self._make_frame()
        input_el = self._make_input_el()

        submit_btn = MagicMock()
        submit_btn.evaluate = AsyncMock()
        frame.wait_for_selector = AsyncMock(return_value=submit_btn)

        # contenteditable=True, 3회 모두 미비워짐
        input_el.evaluate = AsyncMock(side_effect=[True, "텍스트", "텍스트", "텍스트"])

        with patch("src.commenter.comment_writer._is_captcha_present", new_callable=AsyncMock, return_value=False), \
             patch("src.commenter.comment_writer.delay_short", new_callable=AsyncMock), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            frame.page.keyboard = MagicMock()
            frame.page.keyboard.type = AsyncMock()
            result = await _fill_and_submit(frame, input_el, "테스트 댓글", dry_run=False)
        assert result is False

    @pytest.mark.asyncio
    async def test_evaluate_예외시_성공으로_간주(self):
        """evaluate() 예외 발생 시 (요소 사라짐) 성공으로 간주해 True 반환."""
        from src.commenter.comment_writer import _fill_and_submit

        frame = self._make_frame()
        input_el = self._make_input_el()

        submit_btn = MagicMock()
        submit_btn.evaluate = AsyncMock()
        frame.wait_for_selector = AsyncMock(return_value=submit_btn)

        # contenteditable=True, 그 다음 evaluate에서 예외 (요소 사라짐)
        input_el.evaluate = AsyncMock(side_effect=[True, Exception("요소 사라짐")])

        with patch("src.commenter.comment_writer._is_captcha_present", new_callable=AsyncMock, return_value=False), \
             patch("src.commenter.comment_writer._click_like_button", new_callable=AsyncMock), \
             patch("src.commenter.comment_writer.delay_short", new_callable=AsyncMock):
            frame.page.keyboard = MagicMock()
            frame.page.keyboard.type = AsyncMock()
            result = await _fill_and_submit(frame, input_el, "테스트 댓글", dry_run=False)
        assert result is True


# ─────────────────────────────────────────────────────────────────────────────
# is_post_commented — DB 체크
# ─────────────────────────────────────────────────────────────────────────────

class TestIsPostCommented:
    """is_post_commented() — SQLite + Supabase 이중 체크."""

    def setup_method(self):
        """테스트용 임시 DB 생성."""
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        conn = sqlite3.connect(self.tmp.name)
        conn.execute("""
            CREATE TABLE comment_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_url TEXT NOT NULL,
                blog_id TEXT,
                post_title TEXT,
                comment_text TEXT,
                success INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.commit()
        conn.close()

    def teardown_method(self):
        os.unlink(self.tmp.name)

    def _patch_db(self):
        """_resolve_db_path를 임시 DB 경로로 패치."""
        from pathlib import Path
        return patch(
            "src.storage.database._resolve_db_path",
            return_value=Path(self.tmp.name),
        )

    def _mock_supabase_empty(self):
        """Supabase 조회 결과 없음 (중복 없음)."""
        mock_result = MagicMock()
        mock_result.count = 0
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.in_.return_value.execute.return_value = mock_result
        return patch("src.storage.supabase_client.get_supabase", return_value=mock_sb)

    def _mock_supabase_found(self):
        """Supabase 조회 결과 있음 (중복 발견)."""
        mock_result = MagicMock()
        mock_result.count = 1
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.in_.return_value.execute.return_value = mock_result
        return patch("src.storage.supabase_client.get_supabase", return_value=mock_sb)

    def test_기록_없으면_False(self):
        """comment_history에 기록 없고 Supabase에도 없으면 False."""
        from src.storage.database import is_post_commented
        with self._patch_db(), \
             self._mock_supabase_empty(), \
             patch("src.storage.supabase_client._resolve_user_id", return_value="test-uid"):
            result = is_post_commented("https://blog.naver.com/test/123456")
        assert result is False

    def test_성공_기록_있으면_True(self):
        """success=1 기록이 있으면 Supabase 체크 없이 True."""
        from src.storage.database import is_post_commented
        conn = sqlite3.connect(self.tmp.name)
        conn.execute(
            "INSERT INTO comment_history (post_url, success) VALUES (?, 1)",
            ("https://blog.naver.com/test/123456",),
        )
        conn.commit()
        conn.close()

        with self._patch_db():
            result = is_post_commented("https://blog.naver.com/test/123456")
        assert result is True

    def test_실패_기록만_있으면_Supabase_체크(self):
        """success=0만 있고 Supabase에도 없으면 False."""
        from src.storage.database import is_post_commented
        conn = sqlite3.connect(self.tmp.name)
        conn.execute(
            "INSERT INTO comment_history (post_url, success) VALUES (?, 0)",
            ("https://blog.naver.com/test/123456",),
        )
        conn.commit()
        conn.close()

        with self._patch_db(), \
             self._mock_supabase_empty(), \
             patch("src.storage.supabase_client._resolve_user_id", return_value="test-uid"):
            result = is_post_commented("https://blog.naver.com/test/123456")
        assert result is False

    def test_SQLite_없고_Supabase_있으면_True(self):
        """SQLite에 없지만 Supabase pending_comments에 있으면 True."""
        from src.storage.database import is_post_commented
        with self._patch_db(), \
             self._mock_supabase_found(), \
             patch("src.storage.supabase_client._resolve_user_id", return_value="test-uid"):
            result = is_post_commented("https://blog.naver.com/test/123456")
        assert result is True

    def test_Supabase_실패시_SQLite만_사용(self):
        """Supabase 조회 실패 시 경고 로그 후 SQLite 결과(False)만 사용."""
        from src.storage.database import is_post_commented
        with self._patch_db(), \
             patch("src.storage.supabase_client.get_supabase", side_effect=Exception("연결 실패")):
            result = is_post_commented("https://blog.naver.com/test/123456")
        assert result is False


# ─────────────────────────────────────────────────────────────────────────────
# _process_retry_queue — 이미 완료된 포스트 스킵
# ─────────────────────────────────────────────────────────────────────────────

class TestRetryQueueDuplicateSkip:
    """_process_retry_queue() — is_post_commented True이면 retry 스킵."""

    @pytest.mark.asyncio
    async def test_이미_완료된_포스트_스킵(self):
        """is_post_commented True이면 write_comment 호출 없이 retry_queue에서 제거."""
        from src.orchestrator import _process_retry_queue

        target = {
            "post_url": "https://blog.naver.com/youyoubear/123456",
            "post_title": "테스트",
            "blog_id": "youyoubear",
        }

        mock_page = AsyncMock()

        with patch("src.orchestrator.get_retry_targets", return_value=[target]), \
             patch("src.orchestrator.is_post_commented", return_value=True) as mock_check, \
             patch("src.orchestrator.remove_from_retry_queue") as mock_remove, \
             patch("src.orchestrator.write_comment") as mock_write:

            success, failed = await _process_retry_queue(
                mock_page, dry_run=False, user_id="test-user"
            )

        mock_check.assert_called_once_with(target["post_url"], user_id="test-user")
        mock_remove.assert_called_once_with(target["post_url"], user_id="test-user")
        mock_write.assert_not_called()
        assert success == 1
        assert failed == 0

    @pytest.mark.asyncio
    async def test_미완료_포스트는_write_comment_호출(self):
        """is_post_commented False이면 write_comment 정상 호출."""
        from src.orchestrator import _process_retry_queue

        target = {
            "post_url": "https://blog.naver.com/youyoubear/999999",
            "post_title": "테스트",
            "blog_id": "youyoubear",
        }

        mock_page = AsyncMock()

        with patch("src.orchestrator.get_retry_targets", return_value=[target]), \
             patch("src.orchestrator.is_post_commented", return_value=False), \
             patch("src.orchestrator.write_comment", new_callable=AsyncMock, return_value=(True, "댓글")) as mock_write, \
             patch("src.orchestrator.remove_from_retry_queue"), \
             patch("src.orchestrator.record_comment"), \
             patch("src.orchestrator.delay_between_comments", new_callable=AsyncMock):

            success, failed = await _process_retry_queue(
                mock_page, dry_run=False, user_id="test-user"
            )

        mock_write.assert_called_once()
        assert success == 1


# ─────────────────────────────────────────────────────────────────────────────
# command_worker handle_execute — record_comment + approved 롤백
# ─────────────────────────────────────────────────────────────────────────────

class TestHandleExecuteRecordComment:
    """handle_execute(): 성공 시 record_comment 호출, 연속 실패 시 approved 롤백."""

    def _make_approved_comment(self, idx: int) -> dict:
        return {
            "id": f"uuid-{idx}",
            "blog_id": f"blogger{idx}",
            "post_url": f"https://blog.naver.com/blogger{idx}/10000{idx}",
            "post_title": f"게시물 {idx}",
            "comment_text": f"댓글 {idx}",
        }

    @pytest.mark.asyncio
    async def test_성공_시_record_comment_호출(self):
        """댓글 게시 성공 시 record_comment()가 SQLite에 기록된다."""
        comment = self._make_approved_comment(1)

        with patch("command_worker.get_pending_comments_sb", return_value=[comment]), \
             patch("command_worker.write_comment", new_callable=AsyncMock, return_value=(True, "댓글 1")), \
             patch("command_worker.update_pending_status_sb"), \
             patch("command_worker.record_comment") as mock_record, \
             patch("command_worker.add_to_retry_queue"), \
             patch("command_worker.init_db"), \
             patch("command_worker._browser_semaphore", MagicMock(__aenter__=AsyncMock(), __aexit__=AsyncMock())), \
             patch("command_worker.create_browser", new_callable=AsyncMock, return_value=(AsyncMock(), AsyncMock(), AsyncMock())), \
             patch("command_worker.ensure_login_cookie_only", new_callable=AsyncMock, return_value=True), \
             patch("command_worker.async_playwright") as mock_pw:

            mock_pw.return_value.__aenter__ = AsyncMock(return_value=MagicMock())
            mock_pw.return_value.__aexit__ = AsyncMock()

            from command_worker import handle_execute
            await handle_execute(user_id="test-user")

        mock_record.assert_called_once_with(
            comment["post_url"],
            comment["blog_id"],
            comment["post_title"],
            comment["comment_text"],
            True,
            user_id="test-user",
        )

    @pytest.mark.asyncio
    async def test_연속_5회_실패_미처리_approved_롤백(self):
        """연속 5회 실패 후 나머지 댓글은 failed가 아닌 approved로 롤백된다."""
        # 총 8개: 5개 실패 + 3개 미처리
        comments = [self._make_approved_comment(i) for i in range(8)]

        update_calls = []

        async def fake_write(*args, **kwargs):
            return (False, "")

        def fake_update(comment_id, status, decided_by=None):
            update_calls.append((comment_id, status))

        with patch("command_worker.get_pending_comments_sb", return_value=comments), \
             patch("command_worker.write_comment", side_effect=fake_write), \
             patch("command_worker.update_pending_status_sb", side_effect=fake_update), \
             patch("command_worker.record_comment"), \
             patch("command_worker.add_to_retry_queue"), \
             patch("command_worker.init_db"), \
             patch("command_worker._browser_semaphore", MagicMock(__aenter__=AsyncMock(), __aexit__=AsyncMock())), \
             patch("command_worker.create_browser", new_callable=AsyncMock, return_value=(AsyncMock(), AsyncMock(), AsyncMock())), \
             patch("command_worker.ensure_login_cookie_only", new_callable=AsyncMock, return_value=True), \
             patch("command_worker.async_playwright") as mock_pw, \
             patch("asyncio.sleep", new_callable=AsyncMock):

            mock_pw.return_value.__aenter__ = AsyncMock(return_value=MagicMock())
            mock_pw.return_value.__aexit__ = AsyncMock()

            from command_worker import handle_execute
            await handle_execute(user_id="test-user")

        # 연속 5회 실패한 댓글들: failed 처리됨
        failed_calls = [(cid, st) for cid, st in update_calls if st == "failed"]
        # 나머지(미처리)는 approved 롤백
        approved_calls = [(cid, st) for cid, st in update_calls if st == "approved"]

        assert len(approved_calls) >= 1, "미처리 댓글이 approved로 롤백되어야 함"
        # failed는 실제 처리된 것들만 (5개)
        assert len(failed_calls) == 5

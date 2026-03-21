"""
명령 큐 워커 — Supabase bot_commands 테이블을 10초마다 폴링하여 실행.

웹 /bot 페이지에서 버튼 클릭 → bot_commands INSERT →
이 워커가 감지 → 실행 → 결과 UPDATE → 웹에서 폴링으로 상태 표시.

다중 사용자: bot_commands.user_id로 어떤 사용자의 봇을 실행할지 결정.
Playwright 동시 실행: asyncio.Semaphore(2)로 제한 (WSL2 메모리 보호).

실행:
  source .venv/bin/activate
  python command_worker.py
"""

import asyncio
import fcntl
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv()

from src.storage.supabase_client import get_supabase, get_admin_user_id
from src.utils.logger import setup_logger

logger = setup_logger("command_worker")

POLL_INTERVAL = 10  # 초

# Playwright 동시 실행 제한 (WSL2 메모리 보호)
_browser_semaphore = asyncio.Semaphore(2)

# 종료 시그널 처리
_shutdown = False


def _handle_signal(signum, frame):
    global _shutdown
    logger.info(f"종료 시그널 수신 ({signum}), 현재 작업 완료 후 종료...")
    _shutdown = True


signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)

LOCK_FILE = Path(__file__).parent / "data" / "worker.lock"


def _acquire_lock():
    """pidfile 잠금으로 워커 중복 실행 방지. 이미 실행 중이면 즉시 종료."""
    LOCK_FILE.parent.mkdir(exist_ok=True)
    fd = open(LOCK_FILE, "w")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fd.write(str(os.getpid()))
        fd.flush()
        return fd  # fd를 반환해야 잠금 유지 (GC 방지)
    except BlockingIOError:
        logger.error("이미 다른 워커가 실행 중 — 종료")
        sys.exit(1)


# ── 명령 감지 ──────────────────────────────────────────────────────────────


def fetch_pending_command() -> dict | None:
    """pending 상태인 가장 오래된 명령 1개 가져오기."""
    try:
        sb = get_supabase()
        result = (
            sb.table("bot_commands")
            .select("*")
            .eq("status", "pending")
            .order("created_at")
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.error(f"명령 조회 실패: {e}")
    return None


def update_command(command_id: str, **kwargs) -> None:
    """명령 상태 업데이트."""
    try:
        sb = get_supabase()
        sb.table("bot_commands").update(kwargs).eq("id", command_id).execute()
    except Exception as e:
        logger.error(f"명령 상태 업데이트 실패: {e}")


def mark_running(command_id: str) -> None:
    """명령을 running 상태로 변경."""
    update_command(
        command_id,
        status="running",
        started_at=datetime.now(timezone.utc).isoformat(),
    )


def mark_completed(command_id: str, result: dict | None = None) -> None:
    """명령을 completed 상태로 변경."""
    update_command(
        command_id,
        status="completed",
        result=result,
        completed_at=datetime.now(timezone.utc).isoformat(),
    )


def mark_failed(command_id: str, error_message: str) -> None:
    """명령을 failed 상태로 변경."""
    update_command(
        command_id,
        status="failed",
        error_message=error_message[:500],
        completed_at=datetime.now(timezone.utc).isoformat(),
    )


def claim_command() -> dict | None:
    """pending 명령을 atomic하게 claim (SELECT 조건부 UPDATE)."""
    cmd = fetch_pending_command()
    if not cmd:
        return None

    # status='pending' 조건부 UPDATE — 다른 워커가 먼저 가져갔으면 0건 매치
    try:
        sb = get_supabase()
        result = (
            sb.table("bot_commands")
            .update({
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", cmd["id"])
            .eq("status", "pending")
            .execute()
        )
        if not result.data:
            logger.warning(f"명령 선점 실패 (다른 워커가 먼저 처리): {cmd['id'][:8]}")
            return None
        return result.data[0]
    except Exception as e:
        logger.error(f"명령 claim 실패: {e}")
        return None


# ── 명령 실행 핸들러 ──────────────────────────────────────────────────────


async def handle_run(user_id: str | None = None) -> dict:
    """봇 1회 실행 (orchestrator.run)."""
    from src.orchestrator import run

    uid_label = user_id[:8] if user_id else "admin"
    logger.info(f"▶ 봇 실행 시작 (user={uid_label})")
    async with _browser_semaphore:
        await run(dry_run=False, user_id=user_id)
    logger.info(f"✓ 봇 실행 완료 (user={uid_label})")
    return {"message": "봇 실행 완료"}


async def handle_execute(user_id: str | None = None) -> dict:
    """승인된 댓글 일괄 게시."""
    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login, ensure_login_cookie_only
    from src.commenter.comment_writer import write_comment
    from src.storage.database import add_to_retry_queue, init_db
    from src.storage.supabase_client import (
        get_pending_comments_sb,
        update_pending_status_sb,
    )
    from src.utils.browser import create_browser

    # 사용자 DB 초기화 (테이블 없으면 생성)
    init_db(user_id=user_id)

    approved = get_pending_comments_sb("approved", user_id=user_id)
    if not approved:
        return {"message": "승인된 댓글 없음", "total": 0, "success": 0, "failed": 0}

    total = len(approved)
    success_count = 0
    failed_count = 0

    uid_label = user_id[:8] if user_id else "admin"
    logger.info(f"▶ 댓글 게시 시작: 총 {total}개 (user={uid_label})")

    async with _browser_semaphore:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)

            try:
                # 로그인
                if user_id:
                    logged_in = await ensure_login_cookie_only(context, page, user_id)
                else:
                    naver_id = os.environ.get("NAVER_ID", "")
                    naver_pw = os.environ.get("NAVER_PW", "")
                    if not all([naver_id, naver_pw]):
                        raise RuntimeError(".env 인증 정보 누락 (NAVER_ID, NAVER_PW)")
                    logged_in = await ensure_login(context, page, naver_id, naver_pw)

                if not logged_in:
                    raise RuntimeError("네이버 로그인 실패")

                for i, comment in enumerate(approved, 1):
                    comment_id = comment["id"]
                    blog_id = comment["blog_id"]
                    post_url = comment["post_url"]
                    post_title = comment["post_title"]
                    comment_text = comment["comment_text"]

                    logger.info(f"▶ [{i}/{total}] {blog_id} 댓글 작성 중...")

                    try:
                        ok, _ = await write_comment(
                            page=page,
                            post_url=post_url,
                            post_title=post_title,
                            dry_run=False,
                            comment_text=comment_text,
                        )
                        if ok:
                            update_pending_status_sb(comment_id, "posted", decided_by="worker")
                            success_count += 1
                            logger.info(f"✓ [{i}/{total}] 성공: {blog_id}")
                        else:
                            update_pending_status_sb(comment_id, "failed", decided_by="worker")
                            add_to_retry_queue(
                                blog_id, post_url, post_title, "댓글 작성 실패",
                                user_id=user_id,
                            )
                            failed_count += 1
                            logger.warning(f"✗ [{i}/{total}] 실패: {blog_id}")
                    except Exception as e:
                        update_pending_status_sb(comment_id, "failed", decided_by="worker")
                        add_to_retry_queue(
                            blog_id, post_url, post_title, str(e)[:100],
                            user_id=user_id,
                        )
                        failed_count += 1
                        logger.error(f"✗ [{i}/{total}] 예외: {e}")

                    if i < total:
                        await asyncio.sleep(3)
            finally:
                await browser.close()

    return {
        "message": f"댓글 게시 완료: 성공 {success_count} / 실패 {failed_count}",
        "total": total,
        "success": success_count,
        "failed": failed_count,
    }


async def handle_retry(user_id: str | None = None) -> dict:
    """재시도 큐 처리."""
    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login, ensure_login_cookie_only
    from src.commenter.comment_writer import write_comment
    from src.storage.database import (
        add_to_retry_queue,
        get_retry_targets,
        record_comment,
        remove_from_retry_queue,
    )
    from src.utils.browser import create_browser

    targets = get_retry_targets(user_id=user_id)
    if not targets:
        return {"message": "재시도 대상 없음", "total": 0, "success": 0, "failed": 0}

    total = len(targets)
    success_count = 0
    failed_count = 0

    uid_label = user_id[:8] if user_id else "admin"
    logger.info(f"▶ 재시도 실행 시작: 총 {total}건 (user={uid_label})")

    async with _browser_semaphore:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)

            try:
                # 로그인
                if user_id:
                    logged_in = await ensure_login_cookie_only(context, page, user_id)
                else:
                    naver_id = os.environ.get("NAVER_ID", "")
                    naver_pw = os.environ.get("NAVER_PW", "")
                    if not all([naver_id, naver_pw]):
                        raise RuntimeError(".env 인증 정보 누락 (NAVER_ID, NAVER_PW)")
                    logged_in = await ensure_login(context, page, naver_id, naver_pw)

                if not logged_in:
                    raise RuntimeError("네이버 로그인 실패")

                for i, target in enumerate(targets, 1):
                    logger.info(f"▶ 재시도 [{i}/{total}] {target['blog_id']}")
                    try:
                        ok, _ = await write_comment(
                            page=page,
                            post_url=target["post_url"],
                            post_title=target["post_title"],
                            dry_run=False,
                            comment_text=None,
                            context=context,
                            naver_id="" if user_id else os.environ.get("NAVER_ID", ""),
                            naver_pw="" if user_id else os.environ.get("NAVER_PW", ""),
                        )
                        if ok:
                            remove_from_retry_queue(target["post_url"], user_id=user_id)
                            record_comment(
                                target["post_url"], target["blog_id"],
                                target["post_title"], "", True,
                                user_id=user_id,
                            )
                            success_count += 1
                            logger.info(f"✓ 재시도 [{i}/{total}] 성공")
                        else:
                            add_to_retry_queue(
                                target["blog_id"], target["post_url"],
                                target["post_title"], "재시도 실패",
                                user_id=user_id,
                            )
                            failed_count += 1
                            logger.warning(f"✗ 재시도 [{i}/{total}] 실패")
                    except Exception as e:
                        add_to_retry_queue(
                            target["blog_id"], target["post_url"],
                            target["post_title"], str(e)[:100],
                            user_id=user_id,
                        )
                        failed_count += 1
                        logger.error(f"✗ 재시도 [{i}/{total}] 예외: {e}")

                    if i < total:
                        await asyncio.sleep(3)
            finally:
                await browser.close()

    return {
        "message": f"재시도 완료: 성공 {success_count} / 실패 {failed_count}",
        "total": total,
        "success": success_count,
        "failed": failed_count,
    }


async def handle_publish(user_id: str | None = None, payload: dict | None = None) -> dict:
    """
    게시물 네이버 발행.

    payload 필수 키:
      - title, body, hashtags, image_paths, queue_id
    선택 키:
      - category, dry_run
    """
    if not payload:
        raise ValueError("publish 명령에 payload가 필요합니다")

    title = payload.get("title", "")
    body = payload.get("body", "")
    hashtags = payload.get("hashtags", [])
    image_paths = payload.get("image_paths", [])
    queue_id = payload.get("queue_id")
    category = payload.get("category")
    dry_run = payload.get("dry_run", False)

    if not title or not body:
        raise ValueError("title과 body는 필수입니다")

    if not queue_id:
        raise ValueError("queue_id는 필수입니다 (generation_queue 추적용)")

    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login, ensure_login_cookie_only
    from src.publisher.blog_publisher import publish_post
    from src.utils.browser import create_browser

    # 블로그 ID 결정
    if user_id:
        from src.storage.supabase_client import get_user_bot_config
        config = get_user_bot_config(user_id)
        if not config:
            raise RuntimeError("봇 설정 없음 — /bot에서 블로그 ID 설정 필요")
        blog_id = config["naver_blog_id"]
    else:
        blog_id = os.environ.get("MY_BLOG_ID", "")
        if not blog_id:
            raise RuntimeError(".env MY_BLOG_ID 미설정")

    # generation_queue 상태 → publishing
    sb = get_supabase()
    if queue_id:
        sb.table("generation_queue").update({"status": "publishing"}).eq("id", queue_id).execute()

    uid_label = user_id[:8] if user_id else "admin"
    logger.info(f"▶ 게시물 발행 시작: '{title[:30]}...' (user={uid_label})")

    try:
        async with _browser_semaphore:
            async with async_playwright() as pw:
                browser, context, page = await create_browser(pw, headless=True)

                try:
                    # 로그인
                    if user_id:
                        logged_in = await ensure_login_cookie_only(context, page, user_id)
                    else:
                        naver_id = os.environ.get("NAVER_ID", "")
                        naver_pw = os.environ.get("NAVER_PW", "")
                        if not all([naver_id, naver_pw]):
                            raise RuntimeError(".env 인증 정보 누락")
                        logged_in = await ensure_login(context, page, naver_id, naver_pw)

                    if not logged_in:
                        raise RuntimeError("네이버 로그인 실패 — 쿠키 재업로드 필요")

                    post_url = await publish_post(
                        page=page,
                        blog_id=blog_id,
                        title=title,
                        body=body,
                        image_paths=image_paths,
                        hashtags=hashtags,
                        dry_run=dry_run,
                    )
                finally:
                    await browser.close()

        if post_url:
            status = "dry-run" if dry_run else "published"
            # generation_queue 상태 업데이트
            if queue_id:
                update_data = {"status": status}
                if not dry_run:
                    update_data["post_url"] = post_url
                sb.table("generation_queue").update(update_data).eq("id", queue_id).execute()

            logger.info(f"✓ 게시물 발행 완료: {post_url}")
            return {"message": "발행 완료", "post_url": post_url, "queue_id": queue_id}
        else:
            if queue_id:
                sb.table("generation_queue").update({"status": "failed"}).eq("id", queue_id).execute()
            raise RuntimeError("발행 실패 — publish_post()가 None 반환")

    except Exception:
        # 실패 시 generation_queue 상태를 failed로 변경
        if queue_id:
            sb.table("generation_queue").update({"status": "failed"}).eq("id", queue_id).execute()
        raise


async def handle_extract_blog_id(user_id: str | None = None) -> dict:
    """쿠키로 네이버 로그인 후 블로그 ID를 자동 추출하여 bot_settings에 저장."""
    if not user_id:
        raise ValueError("extract_blog_id는 user_id가 필수입니다")

    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login_cookie_only, extract_blog_id
    from src.utils.browser import create_browser

    uid_label = user_id[:8]
    logger.info(f"▶ 블로그 ID 추출 시작 (user={uid_label})")

    async with _browser_semaphore:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)

            try:
                logged_in = await ensure_login_cookie_only(context, page, user_id)
                if not logged_in:
                    raise RuntimeError("네이버 로그인 실패 — 쿠키 재업로드 필요")

                blog_id = await extract_blog_id(context, page)
                if not blog_id:
                    raise RuntimeError("블로그 ID 추출 실패 — 블로그가 없거나 접근 불가")

                # bot_settings에 naver_blog_id만 업데이트
                sb = get_supabase()
                sb.table("bot_settings").update(
                    {"naver_blog_id": blog_id}
                ).eq("user_id", user_id).execute()

                logger.info(f"✓ 블로그 ID 추출 완료: {blog_id} (user={uid_label})")
                return {"message": f"블로그 ID 감지: {blog_id}", "blog_id": blog_id}
            finally:
                await browser.close()


# ── 명령 핸들러 매핑 ──


_HANDLERS = {
    "run": handle_run,
    "execute": handle_execute,
    "retry": handle_retry,
    "publish": handle_publish,
    "extract_blog_id": handle_extract_blog_id,
}


# ── 메인 폴링 루프 ────────────────────────────────────────────────────────


def _cleanup_stale_commands() -> int:
    """워커 재시작 시 running 상태로 남은 명령을 failed로 일괄 변경. 반환: 정리 건수."""
    try:
        sb = get_supabase()
        result = (
            sb.table("bot_commands")
            .update({
                "status": "failed",
                "error_message": "워커 재시작으로 중단됨",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("status", "running")
            .execute()
        )
        count = len(result.data) if result.data else 0
        if count:
            logger.warning(f"stale 명령 {count}건 정리 (running → failed)")
        return count
    except Exception as e:
        logger.error(f"stale 명령 정리 실패: {e}")
        return 0


async def process_command(cmd: dict) -> None:
    """명령 1개를 실행하고 결과를 DB에 기록. (claim_command()에서 이미 running 상태)"""
    command_id = cmd["id"]
    command_type = cmd["command"]
    cmd_user_id = cmd.get("user_id")
    handler = _HANDLERS.get(command_type)

    if not handler:
        mark_failed(command_id, f"알 수 없는 명령: {command_type}")
        return

    uid_label = cmd_user_id[:8] if cmd_user_id else "admin"
    logger.info(f"━━━ 명령 실행: {command_type} (id={command_id[:8]}..., user={uid_label}) ━━━")

    try:
        kwargs: dict = {"user_id": cmd_user_id}
        # publish 명령은 payload도 전달
        if command_type == "publish":
            kwargs["payload"] = cmd.get("payload")
        result = await handler(**kwargs)
        mark_completed(command_id, result)
        logger.info(f"━━━ 명령 완료: {command_type} → {result.get('message', '')} ━━━")
    except Exception as e:
        logger.error(f"━━━ 명령 실패: {command_type} → {e} ━━━", exc_info=True)
        mark_failed(command_id, str(e)[:500])


async def main_loop() -> None:
    """10초 간격 폴링 루프."""
    _lock_fd = _acquire_lock()  # noqa: F841 — 변수 유지해야 잠금 유지

    # 워커 재시작 시 이전 크래시로 남은 stale 명령 정리
    _cleanup_stale_commands()

    logger.info("╔════════════════════════════════════════════╗")
    logger.info("║   명령 큐 워커 시작 (10초 간격 폴링)        ║")
    logger.info("╚════════════════════════════════════════════╝")

    # 시작 시 admin user_id 캐싱 (실패하면 즉시 종료)
    get_admin_user_id()

    while not _shutdown:
        cmd = claim_command()
        if cmd:
            await process_command(cmd)
        else:
            # pending 없으면 대기
            for _ in range(POLL_INTERVAL):
                if _shutdown:
                    break
                await asyncio.sleep(1)

    logger.info("워커 정상 종료")


if __name__ == "__main__":
    asyncio.run(main_loop())

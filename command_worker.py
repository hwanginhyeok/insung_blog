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

# ── 일일 봇 실행 한도 체크 (Freemium Gate) ──

# 한도가 적용되는 명령 목록 (Playwright 브라우저를 소비하는 명령)
_RATE_LIMITED_COMMANDS = {"run", "execute", "visit_neighbors", "discover_and_visit", "feed_comment", "auto_reply"}


def check_daily_bot_limit(user_id: str | None) -> dict:
    """유저별 일일 봇 한도 체크. Supabase RPC(atomic)로 체크+증분.

    Returns: {"allowed": bool, "used": int, "limit": int, "remaining": int}
    """
    if not user_id:
        return {"allowed": True, "used": 0, "limit": 999, "remaining": 999}

    try:
        sb = get_supabase()
        result = sb.rpc("check_daily_bot_limit", {"p_user_id": user_id}).execute()
        if result.data:
            return result.data
    except Exception as e:
        # 한도 체크 실패 시 실행 허용 (서비스 중단 방지)
        setup_logger("command_worker").warning(f"일일 한도 체크 실패 (허용): {e}")

    return {"allowed": True, "used": 0, "limit": 30, "remaining": 30}

logger = setup_logger("command_worker")

POLL_INTERVAL = 10  # 초
USER_MILESTONE_CHECK_INTERVAL = 3600  # 사용자 수 임계점 체크 주기 (1시간)
_USER_COUNT_FILE = Path("/tmp/user_count.txt")  # 워커 재시작해도 중복 알림 방지

# 사용자 수 임계점 목록
_USER_MILESTONES = [10, 50, 100, 500, 1000]
_MILESTONE_MESSAGES = {
    10: "📊 10명 돌파! 현행 인프라 OK",
    50: "⚠️ 50명 돌파! 프록시+API 전환 준비 시작",
    100: "🚨 100명 돌파! 워커 다중화+서버 스펙업 필수",
    500: "🔥 500명 돌파! 분산 아키텍처 전환 시급",
    1000: "🏆 1000명 돌파!",
}

# Playwright 동시 실행 제한 — .env MAX_CONCURRENT_BROWSERS로 조절 가능 (기본 3)
MAX_CONCURRENT_BROWSERS = int(os.environ.get("MAX_CONCURRENT_BROWSERS", "3"))
_browser_semaphore = asyncio.Semaphore(MAX_CONCURRENT_BROWSERS)

# 댓글 실행 루프 상수 (handle_execute + handle_retry 공용)
BATCH_SIZE = 30                  # 브라우저 재시작 간격
MAX_CONSECUTIVE_FAILURES = 5     # 연속 실패 한도 — 초과 시 브라우저 크래시로 판단
WARN_CONSECUTIVE_FAILURES = 3    # 이 시점에 텔레그램 조기 경고
PROGRESS_UPDATE_INTERVAL = 5     # N개 처리마다 웹 진행 상황 업데이트

# ── 유저별 슬롯 추적 (Elastic Semaphore) ──
# 유저 혼자면 전체 슬롯 사용, 유저 늘면 공정 분배
_user_active_slots: dict[str, int] = {}  # user_id → 현재 사용중 슬롯 수


def get_slots_for_user(user_id: str | None) -> int:
    """유저에게 할당 가능한 최대 슬롯 수 계산 (Elastic Semaphore).

    유저 혼자면 전체 슬롯, 유저 늘면 공정 분배.
    """
    uid = user_id or "__admin__"
    # 활성 유저 수 = 현재 슬롯 점유 중인 유저 수
    # 신규 유저(아직 슬롯 미점유)는 자신을 포함하여 계산
    active_set = set(_user_active_slots.keys())
    active_set.add(uid)
    active_users = len(active_set)
    per_user = max(1, MAX_CONCURRENT_BROWSERS // active_users)
    return per_user


def acquire_user_slot(user_id: str | None) -> None:
    """유저 슬롯 카운터 증가."""
    uid = user_id or "__admin__"
    _user_active_slots[uid] = _user_active_slots.get(uid, 0) + 1


def release_user_slot(user_id: str | None) -> None:
    """유저 슬롯 카운터 감소. 0이면 제거."""
    uid = user_id or "__admin__"
    count = _user_active_slots.get(uid, 1) - 1
    if count <= 0:
        _user_active_slots.pop(uid, None)
    else:
        _user_active_slots[uid] = count


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
    """봇 1회 실행 (orchestrator.run). auto_execute=True이면 완료 후 자동 승인 + execute 큐."""
    from src.orchestrator import run

    uid_label = user_id[:8] if user_id else "admin"
    logger.info(f"▶ 봇 실행 시작 (user={uid_label})")
    async with _browser_semaphore:
        await run(dry_run=False, user_id=user_id)
    logger.info(f"✓ 봇 실행 완료 (user={uid_label})")

    # auto_execute: 봇 실행 완료 후 pending 댓글 자동 승인 + execute 명령 큐
    # Supabase 오류가 나도 run 자체는 완료 처리 (try/except로 격리)
    if user_id:
        try:
            from src.storage.supabase_client import (
                get_bot_settings_sb,
                get_pending_comments_sb,
                update_pending_status_sb,
            )
            settings = get_bot_settings_sb(user_id)
            if settings.get("auto_execute"):
                pending = get_pending_comments_sb("pending", user_id=user_id)
                if pending:
                    for comment in pending:
                        update_pending_status_sb(comment["id"], "approved", decided_by="auto_execute")
                    logger.info(f"auto_execute: {len(pending)}개 댓글 자동 승인 (user={uid_label})")
                    # pending이 있을 때만 execute 명령 큐 추가
                    sb = get_supabase()
                    sb.table("bot_commands").insert({
                        "user_id": user_id,
                        "command": "execute",
                        "status": "pending",
                    }).execute()
                    logger.info(f"auto_execute: execute 명령 큐 추가 (user={uid_label})")
                else:
                    logger.info(f"auto_execute: pending 0건, execute 스킵 (user={uid_label})")
        except Exception as auto_err:
            logger.warning(f"auto_execute 큐 실패 (무시, run은 완료): {auto_err} (user={uid_label})")

    return {"message": "봇 실행 완료"}


async def handle_execute(user_id: str | None = None, command_id: str | None = None) -> dict:
    """승인된 댓글 일괄 게시."""
    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login, ensure_login_cookie_only
    from src.commenter.comment_writer import write_comment
    from src.storage.database import add_to_retry_queue, init_db, record_comment
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

    # post_url 기준 중복 제거 — 같은 게시물에 여러 approved가 있으면 첫 번째만 유지
    seen_urls: set[str] = set()
    unique_approved: list[dict] = []
    for comment in approved:
        if comment["post_url"] not in seen_urls:
            unique_approved.append(comment)
            seen_urls.add(comment["post_url"])
        else:
            update_pending_status_sb(
                comment["id"], "rejected",
                decided_by="worker",
                fail_reason="중복 자동 제거 (게시 전 필터)",
            )
            logger.warning(
                f"중복 제거: {comment['blog_id']} / {comment['post_url'][:50]} → rejected"
            )
    if len(approved) != len(unique_approved):
        logger.info(
            f"중복 제거: {len(approved)}개 → {len(unique_approved)}개 "
            f"({len(approved) - len(unique_approved)}건 rejected)"
        )
    approved = unique_approved

    total = len(approved)
    success_count = 0
    failed_count = 0
    fail_reasons: dict[str, int] = {"cookie": 0, "no_input": 0, "other": 0}

    uid_label = user_id[:8] if user_id else "admin"
    logger.info(f"▶ 댓글 게시 시작: 총 {total}개 (user={uid_label})")

    consecutive_failures = 0  # 연속 실패 카운터

    async def _verify_nid_aut(context) -> bool:
        """로그인 후 NID_AUT 쿠키 존재 여부 검증."""
        all_cookies = await context.cookies()
        return any(c["name"] == "NID_AUT" for c in all_cookies)

    async def _login(context, page):
        if user_id:
            logged_in = await ensure_login_cookie_only(context, page, user_id)
            if logged_in and not await _verify_nid_aut(context):
                logger.warning(
                    f"로그인 성공했으나 NID_AUT 없음 (user={user_id[:8]}) — 1회 재시도"
                )
                logged_in = await ensure_login_cookie_only(context, page, user_id)
                if logged_in and not await _verify_nid_aut(context):
                    # NID_AUT 없으면 댓글 제출 버튼 미활성화 — 계속 실행해도 전량 실패
                    # 즉시 중단하고 쿠키 재업로드 요청 알림 전송
                    from src.utils.telegram_notifier import notify_login_failure
                    await notify_login_failure(
                        f"NID_AUT 쿠키가 없습니다 (user={user_id[:8]})\n"
                        "네이버 세션이 만료됐습니다.\n\n"
                        "조치: 웹 대시보드 → [봇 설정] → 쿠키 업로드에서\n"
                        "새 쿠키를 업로드한 뒤 다시 실행해주세요."
                    )
                    raise RuntimeError(
                        "쿠키 만료: NID_AUT 없음 — 웹 대시보드에서 쿠키를 재업로드하세요"
                    )
            return logged_in
        naver_id = os.environ.get("NAVER_ID", "")
        naver_pw = os.environ.get("NAVER_PW", "")
        if not all([naver_id, naver_pw]):
            raise RuntimeError(".env 인증 정보 누락 (NAVER_ID, NAVER_PW)")
        logged_in = await ensure_login(context, page, naver_id, naver_pw)
        if logged_in and not await _verify_nid_aut(context):
            logger.warning("로그인 성공했으나 NID_AUT 없음 (admin) — 1회 재로그인 시도")
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if logged_in and not await _verify_nid_aut(context):
                from src.utils.telegram_notifier import notify_login_failure
                await notify_login_failure(
                    "NID_AUT 쿠키가 없습니다 (admin)\n"
                    "NAVER_ID/NAVER_PW 로 재로그인해도 NID_AUT가 발급되지 않습니다.\n\n"
                    "조치: .env 인증 정보 확인 후 봇을 재시작하세요."
                )
                raise RuntimeError(
                    "쿠키 만료: NID_AUT 없음 — .env 인증 정보를 확인하고 봇을 재시작하세요"
                )
        return logged_in

    async with _browser_semaphore:
        browser = None
        context = None
        page = None
        pw_instance = None

        try:
            pw_instance = await async_playwright().start()

            for i, comment in enumerate(approved, 1):
                # 종료 시그널 수신 시 즉시 중단 — 남은 댓글 approved 롤백 (재시도 가능)
                if _shutdown:
                    remaining = approved[i - 1:]
                    logger.info(f"종료 시그널로 중단 — {len(remaining)}개 approved 롤백")
                    for rc in remaining:
                        update_pending_status_sb(rc["id"], "approved", decided_by="worker")
                    break

                # 브라우저 시작 또는 BATCH_SIZE마다 재시작
                if browser is None or ((i - 1) % BATCH_SIZE == 0 and i > 1):
                    if browser:
                        logger.info(f"▶ 브라우저 재시작 ({i - 1}개 처리 완료)")
                        await browser.close()
                        await asyncio.sleep(3)
                    browser, context, page = await create_browser(pw_instance, headless=True)
                    logged_in = await _login(context, page)
                    if not logged_in:
                        raise RuntimeError("네이버 로그인 실패")
                    consecutive_failures = 0

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
                        # SQLite comment_history 기록 — is_post_commented() 중복 방지용
                        record_comment(post_url, blog_id, post_title, comment_text, True, user_id=user_id)
                        success_count += 1
                        consecutive_failures = 0
                        logger.info(f"✓ [{i}/{total}] 성공: {blog_id}")
                    elif ok is None:
                        # 댓글 입력창 없음 — 게시물 자체 문제 (비공개/설정 차단)
                        # 연속 실패 카운터 증가 안 함 (브라우저 크래시와 무관)
                        update_pending_status_sb(comment_id, "failed", decided_by="worker")
                        failed_count += 1
                        fail_reasons["no_input"] += 1
                        logger.warning(f"✗ [{i}/{total}] 스킵 (입력창 없음): {blog_id}")
                    else:
                        update_pending_status_sb(comment_id, "failed", decided_by="worker")
                        add_to_retry_queue(
                            blog_id, post_url, post_title, "댓글 작성 실패",
                            user_id=user_id,
                        )
                        failed_count += 1
                        consecutive_failures += 1
                        fail_reasons["cookie"] += 1
                        logger.warning(f"✗ [{i}/{total}] 실패: {blog_id}")
                except Exception as e:
                    update_pending_status_sb(comment_id, "failed", decided_by="worker")
                    add_to_retry_queue(
                        blog_id, post_url, post_title, str(e)[:100],
                        user_id=user_id,
                    )
                    failed_count += 1
                    consecutive_failures += 1
                    fail_reasons["other"] += 1
                    logger.error(f"✗ [{i}/{total}] 예외: {e}")

                # 3연속 실패 시 텔레그램 조기 경고 (abort 2회 전)
                if consecutive_failures == WARN_CONSECUTIVE_FAILURES and user_id:
                    try:
                        from src.utils.telegram_notifier import send_telegram_message
                        from src.storage.supabase_client import get_chat_id_for_user
                        chat_id = get_chat_id_for_user(user_id)
                        if chat_id:
                            await send_telegram_message(
                                f"⚠️ 댓글 게시 중 연속 {WARN_CONSECUTIVE_FAILURES}회 실패\n"
                                f"진행: {i}/{total} (성공 {success_count}, 실패 {failed_count})\n"
                                f"계속 진행 중입니다. {MAX_CONSECUTIVE_FAILURES}회 연속 실패 시 자동 중단됩니다.",
                                chat_id=chat_id,
                            )
                    except Exception as warn_err:
                        logger.warning(f"조기 경고 전송 실패: {warn_err}")

                # 연속 실패 한도 초과 → 셀렉터 깨짐 또는 브라우저 크래시로 판단, 중단
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    remaining_count = total - i
                    logger.error(
                        f"연속 {MAX_CONSECUTIVE_FAILURES}회 실패 — 셀렉터 깨짐 또는 브라우저 크래시 판단, "
                        f"나머지 {remaining_count}개 approved 롤백 (수정 후 재시도 가능)"
                    )
                    # 미처리 댓글을 approved로 롤백 — failed로 처리하지 않음
                    # 셀렉터 수정 후 재실행 시 자동 재시도 가능
                    for remaining_comment in approved[i:]:
                        update_pending_status_sb(
                            remaining_comment["id"], "approved", decided_by="worker"
                        )
                    break

                # N개마다 웹 진행 상황 업데이트 (폴링으로 실시간 표시)
                if command_id and i % PROGRESS_UPDATE_INTERVAL == 0:
                    update_command(
                        command_id,
                        result={
                            "progress": i,
                            "total": total,
                            "success": success_count,
                            "failed": failed_count,
                            "fail_reasons": fail_reasons,
                        },
                    )

                # 30개마다 텔레그램 중간 보고 (마지막 배치 제외하여 최종 알림과 중복 방지)
                if user_id and i % 30 == 0 and i < total:
                    try:
                        from src.utils.telegram_notifier import send_telegram_message
                        from src.storage.supabase_client import get_chat_id_for_user
                        chat_id = get_chat_id_for_user(user_id)
                        if chat_id:
                            reason_parts = []
                            if fail_reasons["cookie"]:
                                reason_parts.append(f"쿠키 만료 {fail_reasons['cookie']}건")
                            if fail_reasons["no_input"]:
                                reason_parts.append(f"댓글창 미탐지 {fail_reasons['no_input']}건")
                            if fail_reasons["other"]:
                                reason_parts.append(f"기타 {fail_reasons['other']}건")
                            reason_str = ", ".join(reason_parts) if reason_parts else "없음"
                            await send_telegram_message(
                                f"📊 진행 중 ({i}/{total})\n"
                                f"✅ 성공: {success_count} | ❌ 실패: {failed_count}\n"
                                f"🔍 실패 원인: {reason_str}",
                                chat_id=chat_id,
                            )
                        else:
                            logger.warning(
                                f"텔레그램 중간 보고 스킵: chat_id 미설정 (user={user_id[:8]})"
                            )
                    except Exception as tg_err:
                        logger.warning(f"텔레그램 중간 보고 전송 실패 (loop 계속): {tg_err}")

                if i < total:
                    await asyncio.sleep(3)
        finally:
            if browser:
                await browser.close()
            if pw_instance:
                await pw_instance.stop()

    return {
        "message": f"댓글 게시 완료: 성공 {success_count} / 실패 {failed_count}",
        "total": total,
        "success": success_count,
        "failed": failed_count,
    }


async def handle_retry(user_id: str | None = None, command_id: str | None = None) -> dict:
    """재시도 큐 처리."""
    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login, ensure_login_cookie_only
    from src.commenter.comment_writer import write_comment
    from src.storage.database import (
        add_to_retry_queue,
        get_retry_targets,
        init_db,
        record_comment,
        remove_from_retry_queue,
    )
    from src.utils.browser import create_browser

    # 사용자 DB 초기화 (테이블 없으면 생성)
    init_db(user_id=user_id)

    targets = get_retry_targets(user_id=user_id)
    if not targets:
        return {"message": "재시도 대상 없음", "total": 0, "success": 0, "failed": 0}

    total = len(targets)
    success_count = 0
    failed_count = 0
    fail_reasons: dict[str, int] = {"cookie": 0, "no_input": 0, "other": 0}

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

                consecutive_failures = 0

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
                            consecutive_failures = 0
                            logger.info(f"✓ 재시도 [{i}/{total}] 성공")
                        elif ok is None:
                            # 댓글 입력창 없음 — 연속 실패 카운터 증가 안 함
                            add_to_retry_queue(
                                target["blog_id"], target["post_url"],
                                target["post_title"], "입력창 없음",
                                user_id=user_id,
                            )
                            failed_count += 1
                            fail_reasons["no_input"] += 1
                            logger.warning(f"✗ 재시도 [{i}/{total}] 스킵 (입력창 없음)")
                        else:
                            add_to_retry_queue(
                                target["blog_id"], target["post_url"],
                                target["post_title"], "재시도 실패",
                                user_id=user_id,
                            )
                            failed_count += 1
                            consecutive_failures += 1
                            fail_reasons["cookie"] += 1
                            logger.warning(f"✗ 재시도 [{i}/{total}] 실패")
                    except Exception as e:
                        add_to_retry_queue(
                            target["blog_id"], target["post_url"],
                            target["post_title"], str(e)[:100],
                            user_id=user_id,
                        )
                        failed_count += 1
                        consecutive_failures += 1
                        fail_reasons["other"] += 1
                        logger.error(f"✗ 재시도 [{i}/{total}] 예외: {e}")

                    # 3연속 실패 시 텔레그램 조기 경고
                    if consecutive_failures == WARN_CONSECUTIVE_FAILURES and user_id:
                        try:
                            from src.utils.telegram_notifier import send_telegram_message
                            from src.storage.supabase_client import get_chat_id_for_user
                            chat_id = get_chat_id_for_user(user_id)
                            if chat_id:
                                await send_telegram_message(
                                    f"⚠️ 재시도 중 연속 {WARN_CONSECUTIVE_FAILURES}회 실패\n"
                                    f"진행: {i}/{total} (성공 {success_count}, 실패 {failed_count})\n"
                                    f"계속 진행 중입니다. {MAX_CONSECUTIVE_FAILURES}회 연속 실패 시 자동 중단됩니다.",
                                    chat_id=chat_id,
                                )
                        except Exception as warn_err:
                            logger.warning(f"조기 경고 전송 실패: {warn_err}")

                    # 5연속 실패 시 abort — 셀렉터 깨짐 또는 브라우저 크래시 판단
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                        logger.error(
                            f"연속 {MAX_CONSECUTIVE_FAILURES}회 실패 — 재시도 중단 "
                            f"(진행: {i}/{total}, 성공 {success_count})"
                        )
                        break

                    # N개마다 웹 진행 상황 업데이트 (폴링으로 실시간 표시)
                    if command_id and i % PROGRESS_UPDATE_INTERVAL == 0:
                        update_command(
                            command_id,
                            result={
                                "progress": i,
                                "total": total,
                                "success": success_count,
                                "failed": failed_count,
                                "fail_reasons": fail_reasons,
                            },
                        )

                    # 30개마다 텔레그램 중간 보고 (마지막 배치 제외)
                    if user_id and i % 30 == 0 and i < total:
                        try:
                            from src.utils.telegram_notifier import send_telegram_message
                            from src.storage.supabase_client import get_chat_id_for_user
                            chat_id = get_chat_id_for_user(user_id)
                            if chat_id:
                                reason_parts = []
                                if fail_reasons["cookie"]:
                                    reason_parts.append(f"쿠키 만료 {fail_reasons['cookie']}건")
                                if fail_reasons["no_input"]:
                                    reason_parts.append(f"댓글창 미탐지 {fail_reasons['no_input']}건")
                                if fail_reasons["other"]:
                                    reason_parts.append(f"기타 {fail_reasons['other']}건")
                                reason_str = ", ".join(reason_parts) if reason_parts else "없음"
                                await send_telegram_message(
                                    f"📊 재시도 진행 중 ({i}/{total})\n"
                                    f"✅ 성공: {success_count} | ❌ 실패: {failed_count}\n"
                                    f"🔍 실패 원인: {reason_str}",
                                    chat_id=chat_id,
                                )
                            else:
                                logger.warning(
                                    f"텔레그램 중간 보고 스킵: chat_id 미설정 (user={user_id[:8]})"
                                )
                        except Exception as tg_err:
                            logger.warning(f"텔레그램 중간 보고 전송 실패 (loop 계속): {tg_err}")

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


async def handle_neighbor_request(user_id: str | None = None, payload: dict | None = None) -> dict:
    """서로이웃 신청 실행."""
    if not user_id:
        raise ValueError("neighbor_request는 user_id가 필수입니다")
    if not payload or not payload.get("target_blog_id"):
        raise ValueError("target_blog_id가 필요합니다")

    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login_cookie_only
    from src.neighbor.neighbor_requester import send_neighbor_request
    from src.neighbor.neighbor_sync import save_neighbor_request
    from src.storage.supabase_client import get_user_bot_config
    from src.utils.browser import create_browser

    target_blog_id = payload["target_blog_id"]
    message = payload.get("message", "")

    # 일일 한도 조회
    config = get_user_bot_config(user_id)
    max_per_day = (config or {}).get("max_neighbor_requests_per_day", 10)

    uid_label = user_id[:8]
    logger.info(f"▶ 서로이웃 신청 시작: {target_blog_id} (user={uid_label})")

    async with _browser_semaphore:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)

            try:
                logged_in = await ensure_login_cookie_only(context, page, user_id)
                if not logged_in:
                    raise RuntimeError("네이버 로그인 실패 — 쿠키 재업로드 필요")

                result = await send_neighbor_request(
                    page=page,
                    blog_id=target_blog_id,
                    message=message,
                    max_per_day=max_per_day,
                    user_id=user_id,
                    context=context,
                )

                # 신청 이력 저장
                status = "sent" if result["success"] else "cancelled"
                save_neighbor_request(
                    target_blog_id=target_blog_id,
                    target_blog_name=payload.get("target_blog_name"),
                    message=message,
                    status=status,
                    user_id=user_id,
                )

                logger.info(f"{'✓' if result['success'] else '✗'} 서로이웃 신청: {result['message']}")
                return result
            finally:
                await browser.close()


async def _check_cookie_expiry_on_page(page, context, user_id: str) -> bool:
    """브라우저 작업 후 쿠키 만료 여부 확인.

    로그인 페이지 리다이렉트 또는 NID_AUT 쿠키 부재를 감지한다.
    Returns: True이면 쿠키 만료 상태.
    """
    # 로그인 페이지 리다이렉트 감지
    current_url = page.url or ""
    if "nidlogin" in current_url or "nid.naver.com" in current_url:
        logger.warning(f"쿠키 만료 감지: 로그인 페이지 리다이렉트 (user={user_id[:8]})")
        return True

    # NID_AUT 쿠키 존재 여부 확인
    try:
        all_cookies = await context.cookies()
        has_nid = any(c["name"] == "NID_AUT" for c in all_cookies)
        if not has_nid:
            logger.warning(f"쿠키 만료 감지: NID_AUT 없음 (user={user_id[:8]})")
            return True
    except Exception:
        pass

    return False


async def _handle_cookie_expiry(user_id: str) -> None:
    """쿠키 만료 시 기록 + 텔레그램 알림."""
    from src.storage.supabase_client import record_cookie_expiry, get_chat_id_for_user
    from src.utils.telegram_notifier import send_telegram_message

    record_cookie_expiry(user_id)

    chat_id = get_chat_id_for_user(user_id) if user_id else None
    await send_telegram_message(
        f"⚠️ 쿠키 만료 감지 (이웃봇)\n"
        f"네이버 세션이 만료되었습니다.\n"
        f"웹 대시보드 → [봇 설정] → 쿠키 업로드에서 새 쿠키를 업로드해주세요.",
        chat_id=chat_id,
    )


async def handle_discover_neighbors(
    user_id: str | None = None, payload: dict | None = None
) -> dict:
    """키워드로 새 블로거를 검색하여 이웃 후보로 저장."""
    if not user_id:
        raise ValueError("discover_neighbors는 user_id가 필수입니다")

    keywords = (payload or {}).get("keywords", [])
    if isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(",") if k.strip()]
    if not keywords:
        raise ValueError("검색 키워드가 필요합니다")

    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login_cookie_only
    from src.neighbor.neighbor_discoverer import discover_neighbors
    from src.storage.supabase_client import get_user_bot_config
    from src.utils.browser import create_browser

    config = get_user_bot_config(user_id)
    my_blog_id = (config or {}).get("naver_blog_id", "")
    my_blog_ids = set((config or {}).get("naver_blog_ids", []))
    if my_blog_id:
        my_blog_ids.add(my_blog_id)

    uid_label = user_id[:8]
    logger.info(f"▶ 이웃 발견 시작: 키워드={keywords} (user={uid_label})")

    async with _browser_semaphore:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)
            try:
                logged_in = await ensure_login_cookie_only(context, page, user_id)
                if not logged_in:
                    await _handle_cookie_expiry(user_id)
                    raise RuntimeError("네이버 로그인 실패 — 쿠키 재업로드 필요")
                result = await discover_neighbors(
                    page=page, keywords=keywords, user_id=user_id,
                    my_blog_id=my_blog_id, my_blog_ids=my_blog_ids,
                )
                # 작업 완료 후 쿠키 만료 감지
                if await _check_cookie_expiry_on_page(page, context, user_id):
                    await _handle_cookie_expiry(user_id)
                return result
            finally:
                await browser.close()


async def handle_visit_neighbors(
    user_id: str | None = None, payload: dict | None = None
) -> dict:
    """최근 방문하지 않은 이웃을 방문하고 AI 댓글 생성."""
    if not user_id:
        raise ValueError("visit_neighbors는 user_id가 필수입니다")

    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login_cookie_only
    from src.neighbor.neighbor_visitor import visit_neighbors
    from src.storage.supabase_client import get_user_bot_config
    from src.utils.browser import create_browser

    config = get_user_bot_config(user_id)
    if not config:
        raise RuntimeError("봇 설정 없음 — /bot에서 블로그 ID 설정 필요")

    uid_label = user_id[:8]
    logger.info(f"▶ 이웃 방문 시작 (user={uid_label})")

    async with _browser_semaphore:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)
            try:
                logged_in = await ensure_login_cookie_only(context, page, user_id)
                if not logged_in:
                    await _handle_cookie_expiry(user_id)
                    raise RuntimeError("네이버 로그인 실패 — 쿠키 재업로드 필요")
                my_blog_ids_set = set(config.get("naver_blog_ids", []))
                my_blog_ids_set.add(config["naver_blog_id"])
                result = await visit_neighbors(
                    page=page, context=context, user_id=user_id,
                    my_blog_id=config["naver_blog_id"],
                    settings=config["settings"],
                    my_blog_ids=my_blog_ids_set,
                )
                # 작업 완료 후 쿠키 만료 감지
                if await _check_cookie_expiry_on_page(page, context, user_id):
                    await _handle_cookie_expiry(user_id)
            finally:
                await browser.close()

    # 실행 이력 기록 (bot_run_log)
    from src.storage.supabase_client import record_run_sb

    record_run_sb(
        bloggers_visited=result.get("visited", 0),
        comments_written=result.get("comments_generated", 0),
        comments_failed=result.get("failed", 0),
        error_message="; ".join(result.get("errors", []))[:500] or None,
        user_id=user_id,
    )

    # 전체 실패 시 텔레그램 알림
    if result.get("visited", 0) == 0 and result.get("failed", 0) > 0:
        from src.utils.telegram_notifier import send_telegram_message
        from src.storage.supabase_client import get_chat_id_for_user

        chat_id = get_chat_id_for_user(user_id) if user_id else None
        await send_telegram_message(
            f"⚠️ 이웃 방문 전체 실패\n{result.get('message', '')}\n"
            f"에러: {result['errors'][0]}",
            chat_id=chat_id,
        )

    return result


async def handle_discover_and_visit(
    user_id: str | None = None, payload: dict | None = None
) -> dict:
    """이웃 찾기 + 방문 + 댓글 + 신청을 한 번에 실행."""
    if not user_id:
        raise ValueError("discover_and_visit는 user_id가 필수입니다")

    # 1단계: 이웃 찾기
    discover_result = await handle_discover_neighbors(user_id=user_id, payload=payload)
    discovered = discover_result.get("discovered", 0)

    # 2단계: 이웃 방문
    visit_result = await handle_visit_neighbors(user_id=user_id, payload=payload)
    visited = visit_result.get("visited", 0)
    comments = visit_result.get("comments_generated", 0)
    requests = visit_result.get("neighbor_requests", 0)

    msg = f"발견 {discovered}명 → 방문 {visited}명, 댓글 {comments}개, 신청 {requests}건"
    logger.info(f"찾기+방문 완료: {msg}")
    return {
        "discovered": discovered,
        "visited": visited,
        "comments_generated": comments,
        "neighbor_requests": requests,
        "message": msg,
    }


async def handle_save_draft(user_id: str | None = None, payload: dict | None = None) -> dict:
    """
    네이버 블로그 임시저장.

    payload 필수 키:
      - title, body_html, queue_id
    선택 키:
      - hashtags, image_paths
    """
    if not payload:
        raise ValueError("save_draft 명령에 payload가 필요합니다")

    title = payload.get("title", "")
    body_html = payload.get("body_html", "")
    queue_id = payload.get("queue_id")
    hashtags = payload.get("hashtags", [])
    image_paths = payload.get("image_paths", [])
    photo_urls = payload.get("photo_urls", [])

    if not title or not body_html:
        raise ValueError("title과 body_html은 필수입니다")

    if not queue_id:
        raise ValueError("queue_id는 필수입니다 (generation_queue 추적용)")

    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login, ensure_login_cookie_only
    from src.publisher.blog_publisher import save_draft
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

    # generation_queue 상태 → saving
    sb = get_supabase()
    if queue_id:
        sb.table("generation_queue").update({"status": "saving"}).eq("id", queue_id).execute()

    # Supabase Storage URL → 로컬 임시 파일 다운로드
    downloaded_paths: list[str] = []
    if photo_urls and not image_paths:
        from src.utils.image_downloader import download_images
        downloaded_paths = download_images(photo_urls)
        image_paths = downloaded_paths

    uid_label = user_id[:8] if user_id else "admin"
    logger.info(f"▶ 임시저장 시작: '{title[:30]}...' (user={uid_label}, 이미지={len(image_paths)}장)")

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

                    result = await save_draft(
                        page=page,
                        blog_id=blog_id,
                        title=title,
                        body_html=body_html,
                        image_paths=image_paths,
                        hashtags=hashtags,
                    )
                finally:
                    await browser.close()

        if result.get("success"):
            if queue_id:
                sb.table("generation_queue").update(
                    {"status": "saved"}
                ).eq("id", queue_id).execute()

            logger.info(f"✓ 임시저장 완료 (user={uid_label})")
            return {"message": "임시저장 완료", "queue_id": queue_id}
        else:
            if queue_id:
                sb.table("generation_queue").update(
                    {"status": "save_failed"}
                ).eq("id", queue_id).execute()
            raise RuntimeError(result.get("message", "임시저장 실패"))

    except Exception:
        if queue_id:
            sb.table("generation_queue").update(
                {"status": "save_failed"}
            ).eq("id", queue_id).execute()
        raise
    finally:
        # 다운로드된 임시 파일 정리
        if downloaded_paths:
            from src.utils.image_downloader import cleanup_images
            cleanup_images(downloaded_paths)


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

                # bot_settings에 naver_blog_id 업데이트 + 배열에도 추가
                sb = get_supabase()
                sb.table("bot_settings").update(
                    {"naver_blog_id": blog_id}
                ).eq("user_id", user_id).execute()
                from src.storage.supabase_client import add_blog_id_for_user
                add_blog_id_for_user(user_id, blog_id)

                logger.info(f"✓ 블로그 ID 추출 완료: {blog_id} (user={uid_label})")
                return {"message": f"블로그 ID 감지: {blog_id}", "blog_id": blog_id}
            finally:
                await browser.close()


async def handle_recommend_neighbors(
    user_id: str | None = None, payload: dict | None = None
) -> dict:
    """이웃 추천 목록 생성 (브라우저 불필요 — DB 기반)."""
    if not user_id:
        raise ValueError("recommend_neighbors는 user_id가 필수입니다")

    from src.neighbor.recommend_engine import generate_recommendations

    uid_label = user_id[:8]
    logger.info(f"▶ 이웃 추천 생성 (user={uid_label})")
    result = generate_recommendations(user_id=user_id)
    logger.info(f"✓ 이웃 추천 완료: {result.get('generated', 0)}명 추천")
    return result


async def handle_sync_neighbors(
    user_id: str | None = None, payload: dict | None = None
) -> dict:
    """이웃 상태 동기화 (브라우저 필요 — 네이버 방문)."""
    if not user_id:
        raise ValueError("sync_neighbors는 user_id가 필수입니다")

    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login_cookie_only
    from src.neighbor.neighbor_sync import sync_neighbor_statuses
    from src.utils.browser import create_browser

    uid_label = user_id[:8]
    logger.info(f"▶ 이웃 동기화 시작 (user={uid_label})")

    async with _browser_semaphore:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)
            try:
                logged_in = await ensure_login_cookie_only(context, page, user_id)
                if not logged_in:
                    raise RuntimeError("네이버 로그인 실패 — 쿠키 재업로드 필요")
                result = await sync_neighbor_statuses(page, user_id=user_id)
            finally:
                await browser.close()

    logger.info(f"✓ 이웃 동기화 완료: {result.get('checked', 0)}명 확인, {result.get('updated', 0)}명 갱신")
    return result


async def handle_analyze_theme(
    user_id: str | None = None, payload: dict | None = None
) -> dict:
    """블로그 테마 분석 (브라우저 필요 — 게시물 제목 수집)."""
    if not user_id:
        raise ValueError("analyze_theme은 user_id가 필수입니다")

    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login_cookie_only
    from src.collectors.post_collector import collect_posts
    from src.neighbor.theme_analyzer import update_user_themes
    from src.storage.supabase_client import get_user_bot_config
    from src.utils.browser import create_browser

    config = get_user_bot_config(user_id)
    if not config:
        raise RuntimeError("봇 설정 없음 — /bot에서 블로그 ID 설정 필요")
    blog_id = config["naver_blog_id"]

    uid_label = user_id[:8]
    logger.info(f"▶ 테마 분석 시작: {blog_id} (user={uid_label})")

    async with _browser_semaphore:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)
            try:
                logged_in = await ensure_login_cookie_only(context, page, user_id)
                if not logged_in:
                    raise RuntimeError("네이버 로그인 실패 — 쿠키 재업로드 필요")
                posts = await collect_posts(page, blog_id, count=20)
                titles = [title for _, title in posts] if posts else []
            finally:
                await browser.close()

    if not titles:
        return {"themes": [], "message": "게시물 없음 — 테마 분석 불가"}

    themes = update_user_themes(titles, user_id=user_id)
    logger.info(f"✓ 테마 분석 완료: {themes}")
    return {"themes": themes, "post_count": len(titles), "message": f"테마 {len(themes)}개 감지"}


async def handle_feed_comment(
    user_id: str | None = None, payload: dict | None = None
) -> dict:
    """이웃 새글 피드에서 최신 글에 AI 댓글 생성."""
    if not user_id:
        raise ValueError("feed_comment는 user_id가 필수입니다")

    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login_cookie_only
    from src.neighbor.feed_commenter import comment_on_feed
    from src.storage.supabase_client import get_user_bot_config
    from src.utils.browser import create_browser

    config = get_user_bot_config(user_id)
    if not config:
        raise RuntimeError("봇 설정 없음 — /bot에서 블로그 ID 설정 필요")

    uid_label = user_id[:8]
    logger.info(f"▶ 이웃 새글 피드 댓글 시작 (user={uid_label})")

    async with _browser_semaphore:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)
            try:
                logged_in = await ensure_login_cookie_only(context, page, user_id)
                if not logged_in:
                    await _handle_cookie_expiry(user_id)
                    raise RuntimeError("네이버 로그인 실패 — 쿠키 재업로드 필요")
                my_blog_ids_set = set(config.get("naver_blog_ids", []))
                my_blog_ids_set.add(config["naver_blog_id"])
                result = await comment_on_feed(
                    page=page, context=context, user_id=user_id,
                    my_blog_id=config["naver_blog_id"],
                    settings=config["settings"],
                    my_blog_ids=my_blog_ids_set,
                )
                # 작업 완료 후 쿠키 만료 감지
                if await _check_cookie_expiry_on_page(page, context, user_id):
                    await _handle_cookie_expiry(user_id)
            finally:
                await browser.close()

    # 실행 이력 기록
    from src.storage.supabase_client import record_run_sb

    record_run_sb(
        bloggers_visited=result.get("posts_found", 0),
        comments_written=result.get("comments_generated", 0),
        comments_failed=0,
        error_message=None,
        user_id=user_id,
    )
    return result


# ── 대댓글(답글) 핸들러 ──


async def handle_auto_reply(user_id: str | None = None, payload: dict | None = None) -> dict:
    """내 블로그에 달린 댓글에 자동 답글 (수집 → 생성 → 게시)."""
    from src.collectors.incoming_comment_collector import collect_incoming_comments
    from src.commenter.ai_reply import generate_reply
    from src.commenter.reply_writer import write_reply
    from src.storage.supabase_client import (
        get_existing_comment_nos_sb,
        save_incoming_comments_sb,
        get_incoming_comments_sb,
        update_incoming_reply_sb,
        get_bot_settings_sb,
    )
    from src.storage.database import record_reply, count_today_replies
    from config.settings import (
        MAX_REPLIES_PER_RUN, MAX_REPLIES_PER_DAY,
        MOBILE_UA, MOBILE_VIEWPORT,
    )

    uid_label = user_id[:8] if user_id else "admin"
    logger.info(f"▶ 대댓글 답글 시작 (user={uid_label})")

    from src.storage.supabase_client import get_user_bot_config
    config = get_user_bot_config(user_id)
    if not config:
        return {"error": "봇 설정 없음"}

    blog_id = config.get("naver_blog_id", "")
    blog_ids = set(config.get("naver_blog_ids") or [blog_id])
    if not blog_id:
        return {"error": "블로그 ID 없음"}
    logger.info(f"대댓글 대상 블로그: {blog_id}, 전체 ID: {blog_ids}")

    # 오늘 답글 한도 확인
    today_replies = count_today_replies(user_id=user_id)
    if today_replies >= MAX_REPLIES_PER_DAY:
        logger.info(f"오늘 답글 한도 도달 ({today_replies}/{MAX_REPLIES_PER_DAY})")
        return {"collected": 0, "generated": 0, "posted": 0, "skipped": "일일 한도 도달"}

    remaining = min(MAX_REPLIES_PER_RUN, MAX_REPLIES_PER_DAY - today_replies)
    existing_nos = get_existing_comment_nos_sb(user_id)

    stats = {"collected": 0, "generated": 0, "posted": 0, "failed": 0}

    async with _browser_semaphore:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)

            # ── 수집 단계 (모바일) ──
            mobile_ctx = await browser.new_context(
                user_agent=MOBILE_UA,
                viewport=MOBILE_VIEWPORT,
                locale="ko-KR",
            )
            mobile_page = await mobile_ctx.new_page()

            try:
                new_comments = await collect_incoming_comments(
                    page=mobile_page,
                    my_blog_id=blog_id,
                    my_blog_ids=blog_ids,
                    existing_comment_nos=existing_nos,
                )
                if new_comments:
                    inserted = save_incoming_comments_sb(new_comments, user_id)
                    stats["collected"] = inserted
                    logger.info(f"새 댓글 {inserted}개 저장 (user={uid_label})")
            except Exception as e:
                import traceback
                logger.error(f"댓글 수집 실패: {e}\n{traceback.format_exc()}")
            finally:
                await mobile_ctx.close()

            # ── 생성 + 게시 단계 ──
            pending = get_incoming_comments_sb(user_id, status="pending", limit=remaining)
            logger.info(f"답글 대기 댓글: {len(pending)}개 (user={uid_label})")
            if not pending:
                logger.info(f"답글 대기 댓글 없음 — 종료 (user={uid_label})")
                await browser.close()
                return stats

            # 로그인된 모바일 컨텍스트 생성 (쿠키 직접 주입)
            cookies = config.get("cookies")
            if not cookies:
                logger.warning(f"쿠키 없음 — 답글 게시 불가 (user={uid_label})")
                await browser.close()
                return stats

            reply_ctx = await browser.new_context(
                user_agent=MOBILE_UA,
                viewport=MOBILE_VIEWPORT,
                locale="ko-KR",
            )
            reply_page = await reply_ctx.new_page()

            # 쿠키 복호화 + 주입
            try:
                from src.utils.cookie_crypto import decrypt_cookies
                cookie_list = decrypt_cookies(cookies)
                naver_cookies = []
                for c in cookie_list:
                    naver_cookies.append({
                        "name": c.get("name", ""),
                        "value": c.get("value", ""),
                        "domain": c.get("domain", ".naver.com"),
                        "path": c.get("path", "/"),
                    })
                if naver_cookies:
                    await reply_ctx.add_cookies(naver_cookies)
                    logger.info(f"쿠키 {len(naver_cookies)}개 주입 완료 (user={uid_label})")
                else:
                    logger.warning(f"유효한 쿠키 없음 (user={uid_label})")
                    await reply_ctx.close()
                    await browser.close()
                    return stats
            except Exception as e:
                logger.error(f"쿠키 주입 실패: {e}")
                await reply_ctx.close()
                await browser.close()
                return stats

            for comment in pending:
                try:
                    # AI 답글 생성 (reply용 페르소나 전달)
                    reply_text = generate_reply(
                        comment_text=comment["comment_text"],
                        post_title=comment.get("post_title", ""),
                        commenter_name=comment.get("commenter_name"),
                        persona_tone=config.get("reply_persona_prompt"),
                    )
                    update_incoming_reply_sb(comment["id"], "generated", reply_text)
                    stats["generated"] += 1

                    # 답글 게시
                    success = await write_reply(
                        page=reply_page,
                        post_url=comment["post_url"],
                        comment_no=comment["comment_no"],
                        reply_text=reply_text,
                    )

                    if success:
                        update_incoming_reply_sb(comment["id"], "posted", reply_text)
                        record_reply(
                            comment_no=comment["comment_no"],
                            post_url=comment["post_url"],
                            commenter_id=comment["commenter_id"],
                            comment_text=comment["comment_text"],
                            reply_text=reply_text,
                            success=True,
                            user_id=user_id,
                        )
                        # 대댓글 교류 기록 (이웃 추천 시 반영)
                        try:
                            from src.neighbor.interaction_tracker import record_interaction
                            commenter_id = comment.get("commenter_id", "")
                            if commenter_id:
                                record_interaction(
                                    blog_id=commenter_id,
                                    interaction_type="reply_sent",
                                    post_url=comment.get("post_url"),
                                    content=reply_text[:200] if reply_text else None,
                                    user_id=user_id,
                                )
                        except Exception as e_track:
                            logger.debug(f"대댓글 교류 기록 실패 (무시): {e_track}")
                        stats["posted"] += 1
                        logger.info(
                            f"답글 게시 완료: {comment['commenter_id']} → {reply_text[:30]}..."
                        )
                    else:
                        update_incoming_reply_sb(comment["id"], "pending")
                        stats["failed"] += 1

                    # 답글 간 딜레이 (봇 감지 방지)
                    import random as _random
                    await asyncio.sleep(_random.uniform(3, 8))

                except Exception as e:
                    logger.warning(f"답글 처리 실패 ({comment.get('comment_no', '')[:12]}): {e}")
                    stats["failed"] += 1

            await reply_ctx.close()
            await browser.close()

    logger.info(
        f"✓ 대댓글 완료 (user={uid_label}): "
        f"수집 {stats['collected']}, 생성 {stats['generated']}, "
        f"게시 {stats['posted']}, 실패 {stats['failed']}"
    )
    return stats


# ── 명령 핸들러 매핑 ──


_HANDLERS = {
    "run": handle_run,
    "execute": handle_execute,
    "retry": handle_retry,
    "publish": handle_publish,
    "save_draft": handle_save_draft,
    "extract_blog_id": handle_extract_blog_id,
    "neighbor_request": handle_neighbor_request,
    "discover_neighbors": handle_discover_neighbors,
    "visit_neighbors": handle_visit_neighbors,
    "discover_and_visit": handle_discover_and_visit,
    "recommend_neighbors": handle_recommend_neighbors,
    "sync_neighbors": handle_sync_neighbors,
    "analyze_theme": handle_analyze_theme,
    "feed_comment": handle_feed_comment,
    "auto_reply": handle_auto_reply,
}


# ── 메인 폴링 루프 ────────────────────────────────────────────────────────


async def _cleanup_stale_commands() -> int:
    """워커 재시작 시 running 상태로 남은 명령을 pending으로 복구 (자동 재시도). 반환: 정리 건수."""
    try:
        sb = get_supabase()
        result = (
            sb.table("bot_commands")
            .update({
                "status": "pending",
                "error_message": None,
                "started_at": None,
                "completed_at": None,
            })
            .eq("status", "running")
            .execute()
        )
        count = len(result.data) if result.data else 0
        if count:
            logger.warning(f"stale 명령 {count}건 자동 재시도 (running → pending)")
            await _notify_stale_recovery(result.data)
        return count
    except Exception as e:
        logger.error(f"stale 명령 정리 실패: {e}")
        return 0


async def _cleanup_stale_generation_queue() -> int:
    """워커 재시작 시 publishing/saving 상태로 멈춘 generation_queue를 failed로 복구."""
    try:
        sb = get_supabase()
        total = 0
        for stale_status, fail_status in [("publishing", "failed"), ("saving", "save_failed")]:
            result = (
                sb.table("generation_queue")
                .update({"status": fail_status})
                .eq("status", stale_status)
                .execute()
            )
            count = len(result.data) if result.data else 0
            if count:
                logger.warning(f"generation_queue 고아 복구: {stale_status} → {fail_status} ({count}건)")
                total += count
        return total
    except Exception as e:
        logger.error(f"generation_queue 고아 복구 실패: {e}")
        return 0


def _load_last_user_count() -> int:
    """이전에 저장한 사용자 수 로드 (없으면 0)."""
    try:
        if _USER_COUNT_FILE.exists():
            return int(_USER_COUNT_FILE.read_text().strip())
    except (ValueError, OSError):
        pass
    return 0


def _save_user_count(count: int) -> None:
    """현재 사용자 수를 파일에 저장."""
    try:
        _USER_COUNT_FILE.write_text(str(count))
    except OSError as e:
        logger.warning(f"사용자 수 저장 실패: {e}")


async def _check_user_milestones() -> None:
    """사용자 수 임계점 체크 — webhook 백업용 (1시간마다 호출).

    users 테이블 count 조회 → 이전 값과 비교 → 임계점 돌파 시 텔레그램 알림.
    _last_user_count를 /tmp/user_count.txt에 저장해서 워커 재시작해도 중복 알림 방지.
    """
    try:
        sb = get_supabase()
        result = sb.table("users").select("id", count="exact").execute()
        current_count = result.count if result.count is not None else 0

        if current_count <= 0:
            return

        last_count = _load_last_user_count()

        # 임계점 돌파 체크
        for milestone in _USER_MILESTONES:
            if last_count < milestone <= current_count:
                msg = _MILESTONE_MESSAGES.get(milestone, f"사용자 {milestone}명 돌파!")
                logger.info(f"사용자 임계점 돌파: {milestone}명 (현재 {current_count}명)")
                from src.utils.telegram_notifier import send_telegram_message
                await send_telegram_message(
                    f"{msg}\n\n현재 총 사용자: {current_count}명"
                )

        # 현재 값 저장 (임계점 돌파 여부와 무관하게 항상)
        _save_user_count(current_count)

    except Exception as e:
        logger.warning(f"사용자 수 임계점 체크 실패: {e}")


async def _notify_stale_recovery(commands: list[dict]) -> None:
    """워커 재시작으로 복구된 명령에 대해 사용자 알림 전송."""
    from src.utils.telegram_notifier import send_telegram_message
    from src.storage.supabase_client import get_chat_id_for_user

    # 사용자별로 묶기
    user_cmds: dict[str, list[str]] = {}
    for cmd in commands:
        uid = cmd.get("user_id")
        if uid:
            user_cmds.setdefault(uid, []).append(cmd.get("command", "?"))

    try:
        for uid, cmd_list in user_cmds.items():
            chat_id = get_chat_id_for_user(uid)
            if not chat_id:
                continue
            cmds_str = ", ".join(cmd_list)
            await send_telegram_message(
                f"⚠️ 워커 재시작으로 중단된 명령을 자동 재시도합니다.\n명령: {cmds_str}",
                chat_id=chat_id,
            )
    except Exception as e:
        logger.warning(f"stale 복구 알림 실패: {e}")


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

    # 일일 한도 체크 (Freemium Gate — 브라우저 소비 명령만)
    if command_type in _RATE_LIMITED_COMMANDS:
        limit_result = check_daily_bot_limit(cmd_user_id)
        if not limit_result.get("allowed", True):
            msg = (
                f"일일 봇 실행 한도 초과 "
                f"({limit_result['used']}/{limit_result['limit']}회). "
                f"내일 다시 이용해주세요."
            )
            mark_failed(command_id, msg)
            logger.info(f"━━━ 한도 초과로 차단: {command_type} (user={uid_label}) ━━━")
            # 텔레그램 알림
            if cmd_user_id:
                try:
                    from src.utils.telegram_notifier import notify_command_failure
                    await notify_command_failure(cmd_user_id, command_type, msg)
                except Exception:
                    pass
            return

    try:
        kwargs: dict = {"user_id": cmd_user_id}
        # publish/save_draft/neighbor_request 명령은 payload도 전달
        if command_type in ("publish", "save_draft", "neighbor_request", "discover_neighbors", "visit_neighbors", "discover_and_visit", "feed_comment"):
            kwargs["payload"] = cmd.get("payload")
        # execute/retry는 진행 상황 업데이트용 command_id 전달
        if command_type in ("execute", "retry"):
            kwargs["command_id"] = command_id
        result = await handler(**kwargs)
        mark_completed(command_id, result)
        logger.info(f"━━━ 명령 완료: {command_type} → {result.get('message', '')} ━━━")

        # 완료 알림
        if cmd_user_id:
            try:
                from src.utils.telegram_notifier import notify_command_result
                await notify_command_result(cmd_user_id, command_type, result)
            except Exception as notify_err:
                logger.warning(f"완료 알림 전송 실패: {notify_err}")

    except Exception as e:
        logger.error(f"━━━ 명령 실패: {command_type} → {e} ━━━", exc_info=True)
        mark_failed(command_id, str(e)[:500])

        # 실패 알림 (재시도 버튼 포함)
        if cmd_user_id:
            try:
                from src.utils.telegram_notifier import notify_command_failure
                await notify_command_failure(
                    cmd_user_id, command_type, str(e), command_id=command_id,
                )
            except Exception as notify_err:
                logger.warning(f"실패 알림 전송 실패: {notify_err}")


async def main_loop() -> None:
    """폴링 루프 — 명령을 병렬로 실행 (Semaphore가 동시 실행 제한)."""
    _lock_fd = _acquire_lock()  # noqa: F841 — 변수 유지해야 잠금 유지

    # 워커 재시작 시 이전 크래시로 남은 고아 상태 정리
    await _cleanup_stale_commands()
    await _cleanup_stale_generation_queue()

    logger.info("╔════════════════════════════════════════════════════════╗")
    logger.info(f"║   명령 큐 워커 시작 (병렬 실행, 최대 {MAX_CONCURRENT_BROWSERS}개)       ║")
    logger.info("╚════════════════════════════════════════════════════════╝")

    # 시작 시 admin user_id 캐싱 (실패하면 즉시 종료)
    get_admin_user_id()

    # 시작 시 사용자 수 임계점 1회 체크
    await _check_user_milestones()

    _active_tasks: set[asyncio.Task] = set()
    _last_milestone_check = time.monotonic()

    while not _shutdown:
        # ── 주기적 사용자 수 임계점 체크 (1시간마다) ──
        now = time.monotonic()
        if now - _last_milestone_check >= USER_MILESTONE_CHECK_INTERVAL:
            _last_milestone_check = now
            try:
                await _check_user_milestones()
            except Exception as e:
                logger.warning(f"주기적 임계점 체크 실패: {e}")

        # 완료된 태스크 정리 + 예외 로깅
        done = {t for t in _active_tasks if t.done()}
        for t in done:
            exc = t.exception()
            if exc:
                logger.error(f"태스크 예외: {exc}")
        _active_tasks -= done

        # pending 명령 claim
        cmd = claim_command()
        if cmd:
            active_count = len(_active_tasks)
            logger.info(f"[{active_count + 1}/{MAX_CONCURRENT_BROWSERS} 슬롯] 명령 할당: {cmd['command']}")
            task = asyncio.create_task(process_command(cmd))
            _active_tasks.add(task)
            # 연속으로 더 가져올 수 있으면 바로 다음 명령 확인 (Semaphore가 제한)
            continue
        else:
            # pending 없으면 대기
            for _ in range(POLL_INTERVAL):
                if _shutdown:
                    break
                await asyncio.sleep(1)

    # 종료 시 실행 중인 태스크 대기
    if _active_tasks:
        logger.info(f"종료 대기: {len(_active_tasks)}개 태스크 실행 중...")
        try:
            await asyncio.wait_for(
                asyncio.gather(*_active_tasks, return_exceptions=True),
                timeout=60,
            )
        except asyncio.TimeoutError:
            logger.warning("종료 타임아웃 (60초) — 남은 태스크 강제 종료")
            for t in _active_tasks:
                t.cancel()

    logger.info("워커 정상 종료")


if __name__ == "__main__":
    asyncio.run(main_loop())

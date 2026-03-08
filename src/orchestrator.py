"""
전체 자동 댓글 흐름 조율
1. Supabase에서 봇 설정 로드 (한도, 모드)
2. 로그인 확인
3. 내 블로그 댓글 작성자 수집
4. 각 블로거 방문 → 게시물 3개씩 배치로 댓글 생성
   - 1단계: 게시물 방문 + 본문 추출 (읽기 시뮬레이션)
   - 2단계: 배치 AI 댓글 생성 (API 1회)
   - 3단계: 재방문 + 댓글 작성 (짧은 체류)
5. DB 이력 저장 + 일일 한도 체크
6. 실행 통계 SQLite + Supabase 이중 기록
"""
import os
import time

from playwright.async_api import async_playwright

from config.settings import (
    AUTO_BLOGGER_SCORE_HIGH,
    AUTO_BLOGGER_SCORE_LOW,
    MAX_BLOGGERS_PER_DAY,
    MAX_COMMENTS_PER_DAY,
)
from src.auth.naver_login import ensure_login
from src.auth.session_manager import check_and_refresh_session, get_session_status
from src.utils.telegram_notifier import notify_login_failure
from src.collectors.comment_collector import collect_commenters
from src.collectors.post_collector import collect_posts
from src.commenter.ai_comment import generate_comments_batch
from src.commenter.comment_writer import visit_and_extract, write_comment
from src.detectors.auto_blogger_detector import is_auto_blogger
from src.storage.database import (
    count_today_bloggers,
    count_today_comments,
    init_db,
    is_blogger_visited_today,
    is_post_commented,
    mark_blogger_visited,
    record_comment,
    record_run,
)
from src.storage.supabase_client import (
    add_pending_comment_sb,
    get_bot_settings_sb,
    get_pending_count_sb,
    record_run_sb,
)
from src.utils.browser import create_browser
from src.utils.delay import delay_between_bloggers, delay_between_comments
from src.utils.logger import logger
from src.utils.time_guard import assert_allowed_time


def _load_settings() -> dict:
    """
    Supabase에서 봇 설정 로드. 실패 시 config/settings.py 기본값 사용.
    반환: {max_bloggers_per_day, max_comments_per_day, approval_mode, is_active}
    """
    try:
        settings = get_bot_settings_sb()
        logger.info(
            f"봇 설정 로드 (Supabase): "
            f"모드={settings['approval_mode']}, "
            f"한도={settings['max_bloggers_per_day']}명/{settings['max_comments_per_day']}댓글"
        )
        return settings
    except Exception as e:
        logger.warning(f"Supabase 설정 로드 실패, 기본값 사용: {e}")
        return {
            "max_bloggers_per_day": MAX_BLOGGERS_PER_DAY,
            "max_comments_per_day": MAX_COMMENTS_PER_DAY,
            "approval_mode": "manual",
            "is_active": True,
        }


async def run(dry_run: bool = False, test_visit: str | None = None, mode: str | None = None) -> None:
    """
    메인 자동 댓글 실행.
    dry_run=True    → 댓글 입력만 하고 제출 안 함.
    test_visit=id   → commenter 수집 건너뛰고 해당 블로그 직접 방문.
    """
    assert_allowed_time()
    init_db()

    # Supabase에서 설정 로드
    settings = _load_settings()
    max_bloggers = settings["max_bloggers_per_day"]
    max_comments = settings["max_comments_per_day"]
    approval_mode = settings.get("approval_mode", "manual")

    if not settings.get("is_active", True):
        logger.info("봇 비활성 상태 (Supabase 설정) — 종료")
        return

    naver_id = os.environ.get("NAVER_ID", "")
    naver_pw = os.environ.get("NAVER_PW", "")
    my_blog_id = os.environ.get("MY_BLOG_ID", "")

    if not all([naver_id, naver_pw, my_blog_id]):
        raise EnvironmentError(".env에 NAVER_ID, NAVER_PW, MY_BLOG_ID가 모두 필요합니다.")

    bloggers_visited = 0
    comments_written = 0
    comments_failed = 0
    run_error: str | None = None
    start_time = time.time()

    try:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)

            # 로그인
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                await notify_login_failure("네이버 로그인 실패 — 수동 로그인 필요")
                raise RuntimeError("네이버 로그인 실패 — 실행 중단")

            # 댓글 작성자 수집 (test_visit 지정 시 건너뜀)
            if test_visit:
                commenters = [test_visit]
                logger.info(f"[test-visit] commenter 수집 건너뜀 → {test_visit} 직접 방문")
            else:
                commenters = await collect_commenters(page, my_blog_id)
                if not commenters:
                    logger.info("수집된 댓글 작성자 없음 — 종료")
                    return

            # 오늘 이미 방문한 수 차감
            already_visited = count_today_bloggers()
            remaining_quota = max_bloggers - already_visited
            if remaining_quota <= 0:
                logger.info(f"오늘 블로거 한도({max_bloggers}명) 이미 달성 — 종료")
                return

            # 오늘 이미 작성한 댓글 수 확인
            today_comments = count_today_comments()
            if today_comments >= max_comments:
                logger.info(f"오늘 댓글 한도({max_comments}개) 이미 달성 — 종료")
                return

            logger.info(
                f"오늘 남은 방문 가능 수: {remaining_quota}명 / "
                f"댓글 가능 수: {max_comments - today_comments}개 / "
                f"수집된 댓글 작성자: {len(commenters)}명"
            )

            for blog_id in commenters:
                if bloggers_visited >= remaining_quota:
                    logger.info("오늘 방문 한도 달성 — 중단")
                    break

                if is_blogger_visited_today(blog_id):
                    logger.debug(f"{blog_id}: 오늘 이미 방문 — 스킵")
                    continue

                # 오토 블로거 체크
                is_auto, score, reason = is_auto_blogger(blog_id)
                if is_auto:
                    logger.warning(f"⚠ {blog_id} 스킵: {reason}")
                    mark_blogger_visited(blog_id)
                    bloggers_visited += 1
                    continue
                elif score >= AUTO_BLOGGER_SCORE_LOW:
                    logger.info(f"ℹ {blog_id} 주의: 오토 의심 점수 {score}")

                logger.info(f"▶ 방문: {blog_id}")
                posts = await collect_posts(page, blog_id)

                if not posts:
                    logger.info(f"{blog_id}: 게시물 없음 — 스킵")
                    continue

                # 댓글 대상 필터링
                eligible = [
                    (url, title) for url, title in posts
                    if not is_post_commented(url)
                ]
                if not eligible:
                    logger.info(f"{blog_id}: 댓글 가능한 게시물 없음 — 스킵")
                    continue

                # 일일 한도까지만
                comment_room = max_comments - count_today_comments()
                if comment_room <= 0:
                    logger.info(f"오늘 댓글 한도({max_comments}개) 달성 — 중단")
                    break
                eligible = eligible[:comment_room]

                blogger_had_comment = False
                BATCH_SIZE = 3

                for batch_start in range(0, len(eligible), BATCH_SIZE):
                    batch = eligible[batch_start:batch_start + BATCH_SIZE]

                    # ── 1단계: 게시물 방문 + 본문 추출 ──
                    batch_data: list[dict] = []
                    for post_url, post_title in batch:
                        # 주기적 세션 체크 (5개마다)
                        total_processed = comments_written + comments_failed
                        if total_processed > 0 and total_processed % 5 == 0:
                            session_ok = await check_and_refresh_session(
                                context, page, naver_id, naver_pw
                            )
                            if not session_ok:
                                await notify_login_failure("세션 만료 — 댓글 작성 중단")
                                raise RuntimeError("세션 만료 — 실행 중단")

                        body = await visit_and_extract(page, post_url)
                        batch_data.append({
                            "url": post_url,
                            "title": post_title,
                            "body": body,
                        })
                        await delay_between_comments()

                    # ── 2단계: 배치 AI 댓글 생성 (API 1회) ──
                    ai_comments = generate_comments_batch(
                        [{"body": d["body"], "title": d["title"]} for d in batch_data],
                    )
                    logger.info(
                        f"배치 처리: {len(batch_data)}개 게시물 → "
                        f"API 1회 호출 → {len(ai_comments)}개 댓글"
                    )

                    # ── 3단계: 재방문 + 댓글 작성 ──
                    for i, data in enumerate(batch_data):
                        if count_today_comments() >= max_comments:
                            logger.info(f"오늘 댓글 한도({max_comments}개) 달성 — 중단")
                            break

                        success, comment_text = await write_comment(
                            page, data["url"], data["title"],
                            dry_run=dry_run,
                            context=context, naver_id=naver_id, naver_pw=naver_pw,
                            comment_text=ai_comments[i],
                        )

                        # SQLite 이력 기록
                        record_comment(data["url"], blog_id, data["title"], comment_text, success)

                        # Supabase 대기 댓글 기록
                        if success and comment_text:
                            add_pending_comment_sb(
                                blog_id=blog_id,
                                post_url=data["url"],
                                post_title=data["title"],
                                comment_text=comment_text,
                            )

                        if success:
                            comments_written += 1
                            blogger_had_comment = True
                        else:
                            comments_failed += 1

                        await delay_between_comments()

                if blogger_had_comment:
                    mark_blogger_visited(blog_id)
                    bloggers_visited += 1
                    logger.info(f"✓ {blog_id} 방문 완료")
                    await delay_between_bloggers()

    except Exception as e:
        run_error = str(e)
        logger.error(f"실행 오류: {e}", exc_info=True)
    finally:
        duration = int(time.time() - start_time)
        pending_count = get_pending_count_sb()

        # SQLite 실행 이력 (로컬)
        record_run(bloggers_visited, comments_written, comments_failed, run_error)

        # Supabase 실행 이력 (웹 대시보드용)
        record_run_sb(
            bloggers_visited=bloggers_visited,
            comments_written=comments_written,
            comments_failed=comments_failed,
            pending_count=pending_count,
            error_message=run_error,
            duration_seconds=duration,
        )

        logger.info(
            f"실행 완료 — 방문: {bloggers_visited}명, "
            f"댓글: {comments_written}개 성공 / {comments_failed}개 실패 "
            f"({duration}초)"
        )

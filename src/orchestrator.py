"""
전체 자동 댓글 흐름 조율
1. 로그인 확인
2. 내 블로그 댓글 작성자 수집
3. 각 블로거 방문 → 최근 게시물 3~5개에 댓글
4. DB 이력 저장 + 일일 한도 체크
5. 실행 통계 run_log에 기록
"""
import os

from playwright.async_api import async_playwright

from config.settings import MAX_BLOGGERS_PER_DAY, MAX_COMMENTS_PER_DAY
from src.auth.naver_login import ensure_login
from src.collectors.comment_collector import collect_commenters
from src.collectors.post_collector import collect_posts
from src.commenter.comment_writer import write_comment
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
from src.utils.browser import create_browser
from src.utils.delay import delay_between_bloggers, delay_between_comments
from src.utils.logger import logger
from src.utils.time_guard import assert_allowed_time


async def run(dry_run: bool = False, test_visit: str | None = None) -> None:
    """
    메인 자동 댓글 실행.
    dry_run=True    → 댓글 입력만 하고 제출 안 함.
    test_visit=id   → commenter 수집 건너뛰고 해당 블로그 직접 방문.
    """
    assert_allowed_time()
    init_db()

    naver_id = os.environ.get("NAVER_ID", "")
    naver_pw = os.environ.get("NAVER_PW", "")
    my_blog_id = os.environ.get("MY_BLOG_ID", "")

    if not all([naver_id, naver_pw, my_blog_id]):
        raise EnvironmentError(".env에 NAVER_ID, NAVER_PW, MY_BLOG_ID가 모두 필요합니다.")

    bloggers_visited = 0
    comments_written = 0
    comments_failed = 0
    run_error: str | None = None

    try:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)

            # 로그인
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
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
            remaining_quota = MAX_BLOGGERS_PER_DAY - already_visited
            if remaining_quota <= 0:
                logger.info(f"오늘 블로거 한도({MAX_BLOGGERS_PER_DAY}명) 이미 달성 — 종료")
                return

            # 오늘 이미 작성한 댓글 수 확인
            today_comments = count_today_comments()
            if today_comments >= MAX_COMMENTS_PER_DAY:
                logger.info(f"오늘 댓글 한도({MAX_COMMENTS_PER_DAY}개) 이미 달성 — 종료")
                return

            logger.info(
                f"오늘 남은 방문 가능 수: {remaining_quota}명 / "
                f"댓글 가능 수: {MAX_COMMENTS_PER_DAY - today_comments}개 / "
                f"수집된 댓글 작성자: {len(commenters)}명"
            )

            for blog_id in commenters:
                if bloggers_visited >= remaining_quota:
                    logger.info("오늘 방문 한도 달성 — 중단")
                    break

                if is_blogger_visited_today(blog_id):
                    logger.debug(f"{blog_id}: 오늘 이미 방문 — 스킵")
                    continue

                logger.info(f"▶ 방문: {blog_id}")
                posts = await collect_posts(page, blog_id)

                if not posts:
                    logger.info(f"{blog_id}: 게시물 없음 — 스킵")
                    continue

                blogger_had_comment = False
                for post_url, post_title in posts:
                    # 하루 총 댓글 한도 체크 (게시물 루프 내에서도 확인)
                    if count_today_comments() >= MAX_COMMENTS_PER_DAY:
                        logger.info(f"오늘 댓글 한도({MAX_COMMENTS_PER_DAY}개) 달성 — 중단")
                        break

                    if is_post_commented(post_url):
                        logger.debug(f"이미 댓글 달린 게시물 스킵: {post_url[:60]}")
                        continue

                    success, comment_text = await write_comment(
                        page, post_url, post_title, dry_run=dry_run
                    )
                    record_comment(post_url, blog_id, post_title, comment_text, success)

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
        record_run(bloggers_visited, comments_written, comments_failed, run_error)
        logger.info(
            f"실행 완료 — 방문: {bloggers_visited}명, "
            f"댓글: {comments_written}개 성공 / {comments_failed}개 실패"
        )

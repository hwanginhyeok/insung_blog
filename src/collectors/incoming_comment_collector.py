"""
내 블로그에 달린 새 댓글 수집 모듈.

모바일 페이지(m.blog.naver.com)에서 내 최근 게시물을 순회하며
방문자 댓글을 수집한다. 이미 DB에 있는 댓글은 스킵.

사용 흐름:
  1. 내 블로그 최근 게시물 N개 수집
  2. 각 게시물의 댓글 영역에서 방문자 댓글 파싱
  3. 내 댓글(my_blog_ids) 제외
  4. 이미 수집된 comment_no 제외
  5. 새 댓글만 반환
"""
import re

from playwright.async_api import Page

from config.settings import COMMENT_LOAD_WAIT, REPLY_SCAN_POSTS
from src.utils.logger import setup_logger

logger = setup_logger("incoming_collector")


async def collect_incoming_comments(
    page: Page,
    my_blog_id: str,
    my_blog_ids: set[str],
    existing_comment_nos: set[str],
    max_posts: int = REPLY_SCAN_POSTS,
) -> list[dict]:
    """
    내 블로그 최근 게시물에서 방문자 댓글을 수집.

    Args:
        page: 모바일 Playwright 페이지
        my_blog_id: 내 블로그 ID (게시물 목록 조회용)
        my_blog_ids: 내 블로그 ID 셋 (자기 댓글 필터링)
        existing_comment_nos: 이미 DB에 있는 comment_no 셋
        max_posts: 스캔할 최근 게시물 수

    Returns:
        새 댓글 목록 [{post_url, post_title, log_no, comment_no,
                       commenter_id, commenter_name, comment_text, comment_date}]
    """
    # 내 블로그 최근 게시물 수집
    posts = await _get_my_recent_posts(page, my_blog_id, max_posts)
    if not posts:
        logger.info(f"내 블로그({my_blog_id}) 게시물 없음")
        return []

    logger.info(f"내 블로그 게시물 {len(posts)}개 스캔 시작")
    new_comments: list[dict] = []

    for post_url, post_title, log_no in posts:
        try:
            comments = await _parse_comments_from_post(
                page, my_blog_id, log_no, post_url, post_title,
                my_blog_ids, existing_comment_nos,
            )
            if comments:
                new_comments.extend(comments)
                logger.info(f"[{log_no}] 새 댓글 {len(comments)}개 발견")
        except Exception as e:
            logger.warning(f"[{log_no}] 댓글 수집 실패: {e}")

    logger.info(f"총 새 댓글 {len(new_comments)}개 수집 완료")
    return new_comments


async def _get_my_recent_posts(
    page: Page,
    blog_id: str,
    max_posts: int,
) -> list[tuple[str, str, str]]:
    """내 블로그 최근 게시물 목록 반환. [(url, title, log_no), ...]"""
    url = f"https://m.blog.naver.com/{blog_id}"
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(3000)

    posts = await page.evaluate(
        """(args) => {
            const [blogId, maxPosts] = args;
            const results = [];
            // 게시물 링크 수집
            const links = document.querySelectorAll('a[href*="/' + blogId + '/"]');
            const seen = new Set();
            for (const a of links) {
                const href = a.href || '';
                const match = href.match(/\\/([0-9]{9,})/);
                if (!match) continue;
                const logNo = match[1];
                if (seen.has(logNo)) continue;
                seen.add(logNo);
                const title = a.textContent?.trim()?.substring(0, 100) || '';
                if (title.length < 2) continue;
                results.push({
                    url: 'https://m.blog.naver.com/' + blogId + '/' + logNo,
                    title: title,
                    logNo: logNo,
                });
                if (results.length >= maxPosts) break;
            }
            return results;
        }""",
        [blog_id, max_posts],
    )

    return [(p["url"], p["title"], p["logNo"]) for p in (posts or [])]


async def _parse_comments_from_post(
    page: Page,
    my_blog_id: str,
    log_no: str,
    post_url: str,
    post_title: str,
    my_blog_ids: set[str],
    existing_comment_nos: set[str],
) -> list[dict]:
    """게시물 1개에서 새 방문자 댓글 파싱."""
    await page.goto(post_url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)

    # 댓글 영역 열기
    comment_btn = await page.query_selector('[class*="comment_btn"]')
    if not comment_btn:
        comment_btn = await page.query_selector('a._commentCount')
    if comment_btn:
        await comment_btn.click()
        await page.wait_for_timeout(COMMENT_LOAD_WAIT * 1000)

    # 댓글 파싱 (JS로 한 번에 추출)
    raw_comments = await page.evaluate(
        """() => {
            const boxes = document.querySelectorAll('.u_cbox_comment_box');
            return [...boxes].map(box => {
                // 댓글 번호 (답글 버튼의 data-param)
                const replyBtn = box.querySelector('a.u_cbox_btn_reply[data-param]');
                const commentNo = replyBtn ? replyBtn.getAttribute('data-param') : null;

                // 작성자 blogId
                const nameLink = box.querySelector('a.u_cbox_name');
                let commenterId = null;
                if (nameLink) {
                    const href = nameLink.getAttribute('href') || '';
                    const m = href.match(/blogId=([^&]+)/);
                    if (m) commenterId = m[1];
                    else {
                        const m2 = href.match(/blog\\.naver\\.com\\/([^/?]+)/);
                        if (m2) commenterId = m2[1];
                    }
                }

                // 닉네임
                const nickEl = box.querySelector('.u_cbox_nick');
                const commenterName = nickEl ? nickEl.textContent?.trim() : '';

                // 댓글 내용
                const contentEl = box.querySelector('.u_cbox_contents');
                const text = contentEl ? contentEl.textContent?.trim() : '';

                // 작성 시각
                const dateEl = box.querySelector('.u_cbox_date[data-value]');
                const dateValue = dateEl ? dateEl.getAttribute('data-value') : null;

                // 대댓글인지 확인 (reply_area 안에 있으면 대댓글)
                const isReply = box.closest('.u_cbox_reply_area') !== null;

                return {
                    commentNo, commenterId, commenterName,
                    text, dateValue, isReply,
                };
            });
        }""",
    )

    new_comments = []
    for c in (raw_comments or []):
        # 필수 필드 없으면 스킵
        if not c.get("commentNo") or not c.get("commenterId"):
            continue
        # 대댓글(답글)은 스킵 — 1차 댓글만 수집
        if c.get("isReply"):
            continue
        # 내 댓글 스킵
        if c["commenterId"] in my_blog_ids:
            continue
        # 이미 DB에 있는 댓글 스킵
        if c["commentNo"] in existing_comment_nos:
            continue

        new_comments.append({
            "post_url": post_url,
            "post_title": post_title,
            "log_no": log_no,
            "comment_no": c["commentNo"],
            "commenter_id": c["commenterId"],
            "commenter_name": c.get("commenterName", ""),
            "comment_text": c.get("text", ""),
            "comment_date": c.get("dateValue"),
        })

    return new_comments

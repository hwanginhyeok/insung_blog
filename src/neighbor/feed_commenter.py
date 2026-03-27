"""
이웃 새글 피드 댓글 — 이웃들의 최신 글을 피드에서 수집하여 AI 댓글 생성.

기존 neighbor_visitor.py가 "오래 안 간 이웃을 방문"하는 것이라면,
feed_commenter.py는 "이웃들의 새글 피드를 보고 댓글"하는 것.

흐름:
  1. 이웃 새글 피드 페이지 접속
  2. 최신 게시물 수집 (feed_collector.py)
  3. 이미 댓글 단 글 제외
  4. 게시물 방문 → 본문 추출 → AI 댓글 생성
  5. pending_comments에 저장 (승인 대기 or 자동 승인)
"""
from playwright.async_api import Page, BrowserContext

from src.collectors.feed_collector import collect_feed_posts
from src.commenter.ai_comment import generate_comments_batch
from src.commenter.comment_writer import visit_and_extract
from src.storage.database import init_db, is_post_commented
from src.storage.supabase_client import add_pending_comment_sb
from src.utils.delay import delay_between_comments
from src.utils.logger import setup_logger

logger = setup_logger("feed_commenter")

# 한 번 실행에 최대 댓글 대상 게시물 수
MAX_FEED_COMMENTS_PER_RUN = 10


async def comment_on_feed(
    page: Page,
    context: BrowserContext,
    user_id: str,
    my_blog_id: str,
    settings: dict,
    my_blog_ids: set[str] | None = None,
) -> dict:
    """
    이웃 새글 피드에서 최신 글을 수집하고 AI 댓글 생성.

    Args:
        page: Playwright 페이지
        context: 브라우저 컨텍스트
        user_id: 유저 ID
        my_blog_id: 내 블로그 ID
        settings: 봇 설정 (approval_mode, comment_prompt 등)
        my_blog_ids: 내 블로그 ID 셋 (자기 글 제외)

    Returns:
        {"posts_found": int, "comments_generated": int, "skipped": int, "message": str}
    """
    init_db(user_id=user_id)

    approval_mode = settings.get("approval_mode", "manual")
    comment_prompt = settings.get("comment_prompt")
    my_ids = my_blog_ids or {my_blog_id}

    # 1. 이웃 새글 피드에서 게시물 수집
    feed_posts = await collect_feed_posts(
        page, my_blog_ids=my_ids, max_posts=20,
    )

    if not feed_posts:
        return {
            "posts_found": 0, "comments_generated": 0, "skipped": 0,
            "message": "이웃 새글 피드에서 게시물을 찾지 못했습니다",
        }

    # 2. 이미 댓글 단 글 제외
    new_posts = [
        p for p in feed_posts
        if not is_post_commented(p["url"], user_id=user_id)
    ]

    skipped = len(feed_posts) - len(new_posts)
    if not new_posts:
        return {
            "posts_found": len(feed_posts), "comments_generated": 0,
            "skipped": skipped,
            "message": f"이웃 새글 {len(feed_posts)}개 발견, 모두 이미 댓글 완료",
        }

    # 3. 최대 개수 제한
    targets = new_posts[:MAX_FEED_COMMENTS_PER_RUN]
    logger.info(f"▶ 이웃 새글 댓글 시작: {len(targets)}개 게시물")

    # 4. 3개씩 배치로 처리 (기존 패턴과 동일)
    total_comments = 0
    batch_size = 3

    for batch_start in range(0, len(targets), batch_size):
        batch = targets[batch_start:batch_start + batch_size]

        # 본문 추출
        extract_results = []
        for post in batch:
            try:
                body, has_my_comment = await visit_and_extract(
                    page, post["url"], my_blog_id,
                    my_blog_ids=my_ids,
                )
                if has_my_comment:
                    continue
                if body:
                    extract_results.append({
                        "blog_id": post["blog_id"],
                        "post_url": post["url"],
                        "post_title": post["title"],
                        "title": post["title"],
                        "body": body,
                    })
            except Exception as e:
                logger.debug(f"  {post['blog_id']} 본문 추출 실패: {e}")
            await delay_between_comments()

        if not extract_results:
            continue

        # AI 댓글 배치 생성
        comment_texts = generate_comments_batch(
            extract_results, custom_prompt=comment_prompt,
        )

        # pending_comments에 저장
        for i, comment_text in enumerate(comment_texts):
            if not comment_text or i >= len(extract_results):
                continue
            src = extract_results[i]
            status = "approved" if approval_mode == "auto" else "pending"
            add_pending_comment_sb(
                blog_id=src["blog_id"],
                post_url=src["post_url"],
                post_title=src["post_title"],
                comment_text=comment_text,
                ai_generated=True,
                status=status,
                user_id=user_id,
            )
            total_comments += 1

    msg = f"이웃 새글 {len(feed_posts)}개 발견, {total_comments}개 댓글 생성"
    if skipped:
        msg += f" (이미 댓글 {skipped}개 스킵)"
    logger.info(f"✓ 이웃 새글 댓글 완료: {msg}")

    return {
        "posts_found": len(feed_posts),
        "comments_generated": total_comments,
        "skipped": skipped,
        "message": msg,
    }

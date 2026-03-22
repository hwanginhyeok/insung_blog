"""
이웃 방문 — neighbors 테이블에서 최근 방문하지 않은 이웃을 골라 방문 + AI 댓글 생성 + 이웃 신청.

흐름:
  1. neighbors 테이블에서 last_interaction_at 기준 오래된 순으로 선택
  2. 각 이웃 블로그 방문 → 게시물 수집 → 본문 추출
  3. AI 댓글 배치 생성 → pending_comments에 저장 (승인 대기)
  4. 이웃이 아닌 경우 서로이웃 신청
  5. last_interaction_at 갱신
"""
from datetime import datetime, timezone, timedelta

from playwright.async_api import Page, BrowserContext

from config.settings import (
    MAX_NEIGHBOR_VISITS_PER_RUN,
    NEIGHBOR_VISIT_INTERVAL_DAYS,
)
from src.collectors.post_collector import collect_posts
from src.commenter.ai_comment import generate_comments_batch
from src.commenter.comment_writer import visit_and_extract
from src.neighbor.neighbor_checker import check_neighbor_status
from src.neighbor.neighbor_requester import send_neighbor_request
from src.neighbor.neighbor_sync import (
    update_last_interaction,
    upsert_neighbor,
    save_neighbor_request,
)
from src.storage.database import init_db, is_post_commented
from src.storage.supabase_client import (
    add_pending_comment_sb,
    get_supabase,
)
from src.utils.delay import delay_between_bloggers, delay_between_comments
from src.utils.logger import setup_logger

logger = setup_logger("neighbor_visitor")


async def visit_neighbors(
    page: Page,
    context: BrowserContext,
    user_id: str,
    my_blog_id: str,
    settings: dict,
) -> dict:
    """
    최근 방문하지 않은 이웃을 방문 → AI 댓글 생성 → 이웃 아니면 서로이웃 신청.

    Returns:
        {"visited": int, "comments_generated": int, "neighbor_requests": int, "message": str}
    """
    init_db(user_id=user_id)

    approval_mode = settings.get("approval_mode", "manual")
    comment_prompt = settings.get("comment_prompt")
    auto_request = settings.get("auto_neighbor_request", False)
    max_requests = settings.get("max_neighbor_requests_per_day", 10)
    request_message = settings.get("neighbor_request_message", "")
    max_visits = min(
        settings.get("max_bloggers_per_day", MAX_NEIGHBOR_VISITS_PER_RUN),
        MAX_NEIGHBOR_VISITS_PER_RUN,
    )

    targets = _get_visit_targets(user_id, max_visits)
    if not targets:
        return {"visited": 0, "comments_generated": 0, "neighbor_requests": 0,
                "failed": 0, "errors": [],
                "message": "방문할 이웃이 없습니다 (모두 최근 방문)"}

    logger.info(f"▶ 이웃 방문 시작: {len(targets)}명")

    visited = 0
    comments_generated = 0
    neighbor_requests_sent = 0
    errors: list[str] = []

    for neighbor in targets:
        blog_id = neighbor["blog_id"]
        blog_name = neighbor.get("blog_name") or blog_id
        neighbor_type = neighbor.get("neighbor_type")

        try:
            # 1. 댓글 생성
            count = await _visit_one_neighbor(
                page=page, context=context, blog_id=blog_id,
                my_blog_id=my_blog_id, user_id=user_id,
                approval_mode=approval_mode, comment_prompt=comment_prompt,
            )
            visited += 1
            comments_generated += count

            # 2. 이웃 상태 확인 + 서로이웃 신청 (discovered/미이웃인 경우)
            if neighbor_type in ("discovered", None):
                status = await check_neighbor_status(page, blog_id)
                if status:
                    # 이미 이웃 → 타입 업데이트
                    upsert_neighbor(blog_id=blog_id, neighbor_type=status, user_id=user_id)
                    logger.info(f"  {blog_id}: 이웃 상태 → {status}")
                else:
                    # 이웃 아님 → 서로이웃 신청
                    req_result = await send_neighbor_request(
                        page=page, blog_id=blog_id,
                        message=request_message, max_per_day=max_requests,
                        user_id=user_id,
                    )
                    if req_result["success"]:
                        neighbor_requests_sent += 1
                        save_neighbor_request(
                            target_blog_id=blog_id, target_blog_name=blog_name,
                            message=request_message, status="sent", user_id=user_id,
                        )
                        logger.info(f"  {blog_id}: 서로이웃 신청 완료")
                    else:
                        logger.debug(f"  {blog_id}: 서로이웃 신청 스킵 — {req_result['message']}")

            update_last_interaction(blog_id, user_id=user_id)
            logger.info(f"✓ {blog_name}({blog_id}) 방문 완료: 댓글 {count}개")
        except Exception as e:
            errors.append(f"{blog_name}: {e}")
            logger.warning(f"✗ {blog_id} 방문 실패: {e}")

        if visited < len(targets):
            await delay_between_bloggers()

    failed = len(errors)
    msg = f"이웃 {visited}명 방문, 댓글 {comments_generated}개, 이웃 신청 {neighbor_requests_sent}건"
    if failed:
        msg += f", 실패 {failed}건"
    logger.info(f"이웃 방문 완료: {msg}")
    return {
        "visited": visited,
        "comments_generated": comments_generated,
        "neighbor_requests": neighbor_requests_sent,
        "failed": failed,
        "errors": errors,
        "message": msg,
    }


def _get_visit_targets(user_id: str, max_count: int) -> list[dict]:
    """방문 간격이 지난 이웃을 오래된 순으로 선택."""
    sb = get_supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=NEIGHBOR_VISIT_INTERVAL_DAYS)).isoformat()

    # last_interaction_at이 NULL이거나 cutoff 이전인 이웃
    # NULL first → 한 번도 방문하지 않은 이웃 우선
    result = (
        sb.table("neighbors")
        .select("blog_id, blog_name, neighbor_type, last_interaction_at")
        .eq("user_id", user_id)
        .or_(f"last_interaction_at.is.null,last_interaction_at.lt.{cutoff}")
        .order("last_interaction_at", desc=False, nullsfirst=True)
        .limit(max_count)
        .execute()
    )
    return result.data or []


async def _visit_one_neighbor(
    page: Page,
    context: BrowserContext,
    blog_id: str,
    my_blog_id: str,
    user_id: str,
    approval_mode: str,
    comment_prompt: str | None,
) -> int:
    """블로거 1명 방문 → 게시물 수집 → AI 댓글 생성. 생성된 댓글 수 반환."""
    # 게시물 수집 (최대 5개) — collect_posts는 (url, title) 튜플 리스트 반환
    raw_posts = await collect_posts(page, blog_id)
    if not raw_posts:
        logger.debug(f"  {blog_id}: 게시물 없음")
        return 0

    # 이미 댓글 단 게시물 필터링
    new_posts = [(url, title) for url, title in raw_posts
                 if not is_post_commented(url, user_id=user_id)]
    if not new_posts:
        logger.debug(f"  {blog_id}: 새 게시물 없음 (이미 댓글 완료)")
        return 0

    # 최대 3개 게시물만
    target_posts = new_posts[:3]

    # 1단계: 게시물 방문 + 본문 추출
    extract_results = []
    for post_url, post_title in target_posts:
        try:
            body, has_my_comment = await visit_and_extract(
                page, post_url, my_blog_id
            )
            if has_my_comment:
                continue
            if body:
                extract_results.append({
                    "blog_id": blog_id,
                    "post_url": post_url,
                    "post_title": post_title,
                    "title": post_title,
                    "body": body,
                })
        except Exception as e:
            logger.debug(f"  {blog_id} 본문 추출 실패: {e}")
        await delay_between_comments()

    if not extract_results:
        return 0

    # 2단계: AI 댓글 배치 생성 (반환값: list[str])
    comment_texts = generate_comments_batch(
        extract_results, custom_prompt=comment_prompt
    )

    # 3단계: pending_comments에 저장 (인덱스로 extract_results와 매핑)
    count = 0
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
        count += 1

    return count

"""
ojh919 블로그 테스트 — 기존 인프라 활용하여 3개 게시물에 댓글 생성.

visit_and_extract()가 mainFrame iframe을 올바르게 처리하므로
본문이 정상 추출됨. 생성된 댓글은 pending_comments에 저장.

사용법:
  .venv/bin/python test_ojh919_comments.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv()

from playwright.async_api import async_playwright

from src.auth.naver_login import ensure_login
from src.collectors.post_collector import collect_posts
from src.commenter.ai_comment import generate_comments_batch
from src.commenter.comment_writer import visit_and_extract
from src.storage.supabase_client import add_pending_comment_sb
from src.utils.browser import create_browser
from src.utils.logger import logger

TARGET_BLOG = "ojh919"
POST_COUNT = 3


async def main():
    logger.info(f"▶ {TARGET_BLOG} 블로그 댓글 생성 테스트 시작")

    async with async_playwright() as pw:
        browser, context, page = await create_browser(pw, headless=True)

        try:
            # 1. 로그인
            import os
            naver_id = os.environ.get("NAVER_ID", "")
            naver_pw = os.environ.get("NAVER_PW", "")
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                logger.error("로그인 실패 — 중단")
                return

            # 2. 게시물 수집
            posts = await collect_posts(page, TARGET_BLOG, count=POST_COUNT)
            logger.info(f"수집된 게시물: {len(posts)}개")
            for i, p in enumerate(posts, 1):
                logger.info(f"  [{i}] {p[1][:50]} — {p[0]}")

            if not posts:
                logger.error("게시물 없음 — 중단")
                return

            # 3. 본문 추출 (visit_and_extract — mainFrame 처리됨)
            batch_data = []
            for url, title in posts:
                body, _ = await visit_and_extract(page, url)
                body_preview = body[:100].replace("\n", " ") if body else "(빈 본문)"
                logger.info(f"본문 추출: {len(body)}자 | {body_preview}...")
                batch_data.append({"url": url, "title": title, "body": body})
                await asyncio.sleep(2)

            # 4. 배치 AI 댓글 생성
            ai_comments = generate_comments_batch(
                [{"body": d["body"], "title": d["title"]} for d in batch_data],
            )
            logger.info(f"AI 댓글 생성 완료: {len(ai_comments)}개")

            # 5. Supabase pending_comments에 저장
            for i, data in enumerate(batch_data):
                comment = ai_comments[i]
                logger.info(f"  [{i+1}] 댓글: {comment}")
                add_pending_comment_sb(
                    blog_id=TARGET_BLOG,
                    post_url=data["url"],
                    post_title=data["title"],
                    comment_text=comment,
                )

            logger.info(f"✓ {len(batch_data)}개 댓글 pending 등록 완료")
            logger.info("웹에서 승인 후 '댓글 게시' 버튼으로 실제 게시 가능")

        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

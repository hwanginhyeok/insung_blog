"""
FastAPI 웹훅 서버 — n8n이 HTTP로 호출하는 엔드포인트

엔드포인트:
  POST /generate      ← 사진 경로 + 메모 → AI 초안 생성
  POST /publish       ← 승인된 초안을 네이버에 게시
  GET  /status        ← 오늘 댓글 봇 현황
  POST /comment/run   ← 댓글 봇 1회 실행
  POST /feedback      ← 피드백 → 글쓰기 스킬 업데이트

실행:
  source .venv/bin/activate
  uvicorn api_server:app --port 8001
"""
import asyncio
import os
import sys
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from src.storage.database import (
    count_today_bloggers,
    count_today_comments,
    init_db,
    record_post,
    update_post_status,
)
from src.utils.logger import logger

app = FastAPI(title="인성이 블로그 자동화 API", version="1.0.0")

# 서버 시작 시 DB 초기화
init_db()


# ── 요청/응답 모델 ──────────────────────────────────────────────────────────


class GenerateRequest(BaseModel):
    image_paths: list[str]
    memo: str = ""


class GenerateResponse(BaseModel):
    title: str
    body: str
    hashtags: list[str]


class PublishRequest(BaseModel):
    title: str
    body: str
    hashtags: list[str] = []
    image_paths: list[str] = []
    dry_run: bool = False


class PublishResponse(BaseModel):
    success: bool
    post_url: str | None = None
    post_id: int | None = None
    message: str = ""


class StatusResponse(BaseModel):
    today_comments: int
    today_bloggers: int
    comment_bot_running: bool = False


class CommentRunResponse(BaseModel):
    success: bool
    bloggers_visited: int = 0
    comments_written: int = 0
    comments_failed: int = 0
    message: str = ""


# ── 댓글 봇 실행 상태 ──
_comment_bot_task: asyncio.Task | None = None


# ── 엔드포인트 ──────────────────────────────────────────────────────────────


@app.post("/generate", response_model=GenerateResponse)
async def generate_content(req: GenerateRequest):
    """사진 + 메모 → AI 블로그 초안 생성"""
    from src.ai.content_generator import generate_post

    try:
        result = generate_post(req.image_paths, req.memo)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"AI 콘텐츠 생성 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI 콘텐츠 생성 중 오류가 발생했습니다")

    return GenerateResponse(
        title=result["title"],
        body=result["body"],
        hashtags=result["hashtags"],
    )


@app.post("/publish", response_model=PublishResponse)
async def publish_post_endpoint(req: PublishRequest):
    """승인된 초안을 네이버 블로그에 게시"""
    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login
    from src.publisher.blog_publisher import publish_post
    from src.utils.browser import create_browser

    naver_id = os.environ.get("NAVER_ID", "")
    naver_pw = os.environ.get("NAVER_PW", "")
    blog_id = os.environ.get("MY_BLOG_ID", "")

    if not all([naver_id, naver_pw, blog_id]):
        raise HTTPException(status_code=500, detail=".env 인증 정보 누락")

    # DB에 초안 저장
    post_id = record_post(
        req.title, req.body, req.hashtags, req.image_paths, status="publishing"
    )

    try:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)

            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                update_post_status(post_id, "failed")
                return PublishResponse(
                    success=False, post_id=post_id, message="로그인 실패"
                )

            post_url = await publish_post(
                page=page,
                blog_id=blog_id,
                title=req.title,
                body=req.body,
                image_paths=req.image_paths,
                hashtags=req.hashtags,
                dry_run=req.dry_run,
            )

            await browser.close()

        if post_url:
            status = "dry-run" if req.dry_run else "published"
            update_post_status(post_id, status, post_url if not req.dry_run else None)
            return PublishResponse(
                success=True, post_url=post_url, post_id=post_id, message="발행 완료"
            )
        else:
            update_post_status(post_id, "failed")
            return PublishResponse(
                success=False, post_id=post_id, message="발행 실패"
            )

    except Exception as e:
        update_post_status(post_id, "failed")
        logger.error(f"발행 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="블로그 발행 중 오류가 발생했습니다")


@app.get("/status", response_model=StatusResponse)
async def get_status():
    """오늘 댓글 봇 현황 조회"""
    return StatusResponse(
        today_comments=count_today_comments(),
        today_bloggers=count_today_bloggers(),
        comment_bot_running=_comment_bot_task is not None
        and not _comment_bot_task.done(),
    )


@app.post("/comment/run", response_model=CommentRunResponse)
async def run_comment_bot():
    """댓글 봇 1회 실행 (비동기 백그라운드)"""
    global _comment_bot_task

    if _comment_bot_task and not _comment_bot_task.done():
        return CommentRunResponse(
            success=False, message="댓글 봇이 이미 실행 중입니다"
        )

    async def _run():
        from src.orchestrator import run

        await run(dry_run=False)

    _comment_bot_task = asyncio.create_task(_run())

    return CommentRunResponse(success=True, message="댓글 봇 실행 시작됨")


class FeedbackRequest(BaseModel):
    post_title: str
    feedback_text: str


class FeedbackResponse(BaseModel):
    success: bool
    message: str = ""


@app.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(req: FeedbackRequest):
    """피드백 → 글쓰기 스킬 업데이트"""
    from src.ai.skill_manager import record_feedback

    ok = record_feedback(req.post_title, req.feedback_text)
    if ok:
        return FeedbackResponse(success=True, message="피드백 반영 완료")
    return FeedbackResponse(success=False, message="피드백 반영 실패")


@app.get("/health")
async def health_check():
    """헬스체크"""
    return {"status": "ok"}

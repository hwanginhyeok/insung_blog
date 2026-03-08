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

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

# ── API 인증 ──
_security = HTTPBearer()
_API_TOKEN = os.environ.get("API_SECRET_TOKEN", "")


def _verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> str:
    """Bearer 토큰 검증. 실패 시 401 반환."""
    if not _API_TOKEN:
        raise HTTPException(status_code=500, detail="서버 인증 토큰 미설정")
    if credentials.credentials != _API_TOKEN:
        raise HTTPException(status_code=401, detail="인증 실패")
    return credentials.credentials

from src.storage.database import (
    count_today_bloggers,
    count_today_comments,
    init_db,
    record_post,
    update_post_status,
)
from src.utils.logger import get_api_logger

logger = get_api_logger()

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
    category: str | None = None


class PublishRequest(BaseModel):
    title: str
    body: str
    hashtags: list[str] = []
    image_paths: list[str] = []
    category: str | None = None
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


class CommentExecuteRequest(BaseModel):
    chat_id: int | None = None  # 텔레그램 결과 알림용


class CommentExecuteResponse(BaseModel):
    success: bool
    total: int = 0
    success_count: int = 0
    failed_count: int = 0
    message: str = ""
    details: list[dict] = []


# ── 댓글 봇 실행 상태 ──
_comment_bot_task: asyncio.Task | None = None


# ── 엔드포인트 ──────────────────────────────────────────────────────────────


def _validate_image_paths(paths: list[str]) -> list[str]:
    """이미지 경로를 검증하고 안전한 절대 경로로 변환. 허용 디렉토리 외부 접근 차단."""
    _ALLOWED_DIRS = [Path.cwd(), Path("/tmp")]
    safe_paths = []
    for p in paths:
        resolved = Path(p).resolve()
        if not any(str(resolved).startswith(str(d.resolve())) for d in _ALLOWED_DIRS):
            raise ValueError(f"허용되지 않은 경로: {resolved}")
        safe_paths.append(str(resolved))
    return safe_paths


@app.post("/generate", response_model=GenerateResponse)
async def generate_content(req: GenerateRequest, _=Depends(_verify_token)):
    """사진 + 메모 → AI 블로그 초안 생성"""
    from src.ai.content_generator import generate_post

    try:
        safe_paths = _validate_image_paths(req.image_paths)
        result = generate_post(safe_paths, req.memo)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"AI 콘텐츠 생성 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI 콘텐츠 생성 중 오류가 발생했습니다")

    return GenerateResponse(
        title=result["title"],
        body=result["body"],
        hashtags=result["hashtags"],
        category=result.get("category"),
    )


@app.post("/publish", response_model=PublishResponse)
async def publish_post_endpoint(req: PublishRequest, _=Depends(_verify_token)):
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

    try:
        safe_image_paths = _validate_image_paths(req.image_paths)
    except ValueError:
        raise HTTPException(status_code=400, detail="허용되지 않은 이미지 경로")

    # DB에 초안 저장
    post_id = record_post(
        req.title, req.body, req.hashtags, safe_image_paths,
        status="publishing", category=req.category,
    )

    try:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)

            try:
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
                    image_paths=safe_image_paths,
                    hashtags=req.hashtags,
                    dry_run=req.dry_run,
                )
            finally:
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
async def get_status(_=Depends(_verify_token)):
    """오늘 댓글 봇 현황 조회"""
    return StatusResponse(
        today_comments=count_today_comments(),
        today_bloggers=count_today_bloggers(),
        comment_bot_running=_comment_bot_task is not None
        and not _comment_bot_task.done(),
    )


@app.post("/comment/run", response_model=CommentRunResponse)
async def run_comment_bot(_=Depends(_verify_token)):
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
    category: str | None = None


class FeedbackResponse(BaseModel):
    success: bool
    message: str = ""


@app.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(req: FeedbackRequest, _=Depends(_verify_token)):
    """피드백 → 글쓰기 스킬 업데이트"""
    from src.ai.skill_manager import record_feedback

    ok = record_feedback(req.post_title, req.feedback_text, category=req.category)
    if ok:
        return FeedbackResponse(success=True, message="피드백 반영 완료")
    return FeedbackResponse(success=False, message="피드백 반영 실패")


@app.post("/comment/execute", response_model=CommentExecuteResponse)
async def execute_pending_comments(
    req: CommentExecuteRequest, _=Depends(_verify_token)
):
    """
    승인된 댓글 일괄 실행.
    
    흐름:
      1. DB에서 approved 상태 댓글 조회
      2. 브라우저 생성 → 로그인
      3. 순차적으로 댓글 작성
      4. 성공 → posted, 실패 → retry_queue + failed
      5. 브라우저 종료
      6. 텔레그램 결과 알림 (chat_id 제공 시)
    """
    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login
    from src.commenter.comment_writer import write_comment
    from src.storage.database import add_to_retry_queue
    from src.storage.supabase_client import (
        get_pending_comments_sb,
        update_pending_status_sb,
    )
    from src.utils.browser import create_browser

    # 1. 승인된 댓글 조회 (Supabase)
    approved_comments = get_pending_comments_sb("approved")
    if not approved_comments:
        return CommentExecuteResponse(
            success=True, total=0, message="승인된 댓글이 없습니다"
        )

    naver_id = os.environ.get("NAVER_ID", "")
    naver_pw = os.environ.get("NAVER_PW", "")

    if not all([naver_id, naver_pw]):
        raise HTTPException(status_code=500, detail=".env 인증 정보 누락")

    total = len(approved_comments)
    success_count = 0
    failed_count = 0
    details = []

    logger.info(f"▶ 댓글 일괄 실행 시작: 총 {total}개")

    try:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)

            try:
                # 2. 로그인
                logged_in = await ensure_login(context, page, naver_id, naver_pw)
                if not logged_in:
                    logger.error("로그인 실패")
                    return CommentExecuteResponse(
                        success=False,
                        total=total,
                        message="네이버 로그인 실패",
                        details=[],
                    )
                logger.info("✓ 로그인 성공")

                # 3. 순차 실행
                for i, comment in enumerate(approved_comments, 1):
                    blog_id = comment["blog_id"]
                    post_url = comment["post_url"]
                    post_title = comment["post_title"]
                    comment_text = comment["comment_text"]
                    comment_id = comment["id"]

                    logger.info(f"▶ [{i}/{total}] {blog_id} 댓글 작성 중...")

                    try:
                        success, _ = await write_comment(
                            page=page,
                            post_url=post_url,
                            post_title=post_title,
                            dry_run=False,
                            comment_text=comment_text,
                        )

                        if success:
                            # 성공 → posted 상태로 업데이트
                            update_pending_status_sb(comment_id, "posted", decided_by="api")
                            success_count += 1
                            details.append(
                                {
                                    "blog_id": blog_id,
                                    "status": "success",
                                    "message": f"댓글 작성 완료 ({len(comment_text)}자)",
                                }
                            )
                            logger.info(f"✓ [{i}/{total}] 성공: {blog_id}")
                        else:
                            # 실패 → failed + retry_queue
                            update_pending_status_sb(comment_id, "failed", decided_by="api")
                            add_to_retry_queue(
                                blog_id=blog_id,
                                post_url=post_url,
                                post_title=post_title,
                                fail_reason="댓글 작성 실패",
                            )
                            failed_count += 1
                            details.append(
                                {
                                    "blog_id": blog_id,
                                    "status": "failed",
                                    "message": "댓글 작성 실패 (내일 재시도 예정)",
                                }
                            )
                            logger.warning(f"✗ [{i}/{total}] 실패: {blog_id}")

                    except Exception as e:
                        # 예외 발생 → failed + retry_queue
                        update_pending_status_sb(comment_id, "failed", decided_by="api")
                        add_to_retry_queue(
                            blog_id=blog_id,
                            post_url=post_url,
                            post_title=post_title,
                            fail_reason=str(e)[:100],
                        )
                        failed_count += 1
                        details.append(
                            {
                                "blog_id": blog_id,
                                "status": "error",
                                "message": f"오류: {str(e)[:50]}",
                            }
                        )
                        logger.error(f"✗ [{i}/{total}] 예외: {e}")

                    # 댓글 사이 딜레이 (봇 감지 회피)
                    if i < total:
                        await asyncio.sleep(3)

            finally:
                await browser.close()
                logger.info("✓ 브라우저 종료")

    except Exception as e:
        logger.error(f"댓글 실행 중 오류: {e}", exc_info=True)
        return CommentExecuteResponse(
            success=False,
            total=total,
            success_count=success_count,
            failed_count=failed_count,
            message=f"실행 중 오류 발생: {str(e)[:100]}",
            details=details,
        )

    # 6. 텔레그램 알림
    if req.chat_id:
        await _send_telegram_notification(
            req.chat_id, total, success_count, failed_count, details
        )

    status_icon = "✅" if failed_count == 0 else "⚠️"
    message = f"{status_icon} 실행 완료: 성공 {success_count}개 / 실패 {failed_count}개"

    return CommentExecuteResponse(
        success=True,
        total=total,
        success_count=success_count,
        failed_count=failed_count,
        message=message,
        details=details,
    )


async def _send_telegram_notification(
    chat_id: int,
    total: int,
    success_count: int,
    failed_count: int,
    details: list[dict],
) -> None:
    """텔레그램으로 실행 결과 알림 발송."""
    import httpx

    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN 미설정, 알림 스킵")
        return

    status_icon = "✅" if failed_count == 0 else "⚠️"

    # 요약 메시지
    summary = (
        f"{status_icon} <b>댓글 실행 완료</b>\n\n"
        f"📊 <b>결과:</b> 총 {total}개 / 성공 {success_count}개 / 실패 {failed_count}개\n\n"
        f"<b>상세 내역:</b>\n"
    )

    # 상세 내역 (최대 10개)
    for i, d in enumerate(details[:10], 1):
        icon = "✅" if d["status"] == "success" else "❌"
        summary += f"{i}. {icon} {d['blog_id']}: {d['message']}\n"

    if len(details) > 10:
        summary += f"... 외 {len(details) - 10}개\n"

    if failed_count > 0:
        summary += "\n💡 실패한 댓글은 내일 재시도됩니다."

    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": summary,
                    "parse_mode": "HTML",
                },
                timeout=10,
            )
        logger.info(f"✓ 텔레그램 알림 발송 완료 (chat_id: {chat_id})")
    except Exception as e:
        logger.warning(f"텔레그램 알림 발송 실패: {e}")


@app.get("/health")
async def health_check():
    """헬스체크"""
    return {"status": "ok"}

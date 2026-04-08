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
    add_to_retry_queue,
    count_today_bloggers,
    count_today_comments,
    get_retry_targets,
    init_db,
    record_post,
    remove_from_retry_queue,
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
    user_id: str | None = None  # 다중 사용자: Supabase 쿠키/blog_id 사용
    chat_id: int | None = None  # 텔레그램 발행 완료 알림용


class PublishResponse(BaseModel):
    success: bool
    post_url: str | None = None
    post_id: int | None = None
    message: str = ""


class StatusResponse(BaseModel):
    today_comments: int
    today_bloggers: int
    comment_bot_running: bool = False
    retry_queue_count: int = 0
    pending_count: int = 0
    approval_mode: str = "manual"
    last_run: dict | None = None


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
    command_id: str | None = None


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
    """
    승인된 초안을 네이버 블로그에 게시 → 워커 큐로 오프로드.

    이전: API 핸들러에서 브라우저 직접 실행 (수 분간 블로킹)
    현재: bot_commands 큐에 publish 명령 삽입 → 워커가 비동기 처리
    """
    from src.storage.supabase_client import get_supabase

    user_id = req.user_id

    # 인증 정보 사전 검증 (큐 삽입 전에 빠른 실패)
    if user_id:
        from src.storage.supabase_client import get_user_bot_config
        config = get_user_bot_config(user_id)
        if not config:
            raise HTTPException(
                status_code=400,
                detail="봇 설정이 없거나 블로그 ID가 미설정입니다. /bot 페이지에서 설정하세요.",
            )
    else:
        naver_id = os.environ.get("NAVER_ID", "")
        naver_pw = os.environ.get("NAVER_PW", "")
        blog_id = os.environ.get("MY_BLOG_ID", "")
        if not all([naver_id, naver_pw, blog_id]):
            raise HTTPException(status_code=500, detail=".env 인증 정보 누락")

    try:
        safe_image_paths = _validate_image_paths(req.image_paths)
    except ValueError:
        raise HTTPException(status_code=400, detail="허용되지 않은 이미지 경로")

    # DB에 초안 저장 (queue_id로 사용)
    post_id = record_post(
        req.title, req.body, req.hashtags, safe_image_paths,
        status="queued", category=req.category,
    )

    # 워커 큐에 publish 명령 삽입
    payload = {
        "title": req.title,
        "body": req.body,
        "hashtags": req.hashtags or [],
        "image_paths": safe_image_paths,
        "queue_id": post_id,
        "category": req.category,
        "dry_run": req.dry_run,
    }
    if req.chat_id:
        payload["chat_id"] = req.chat_id

    try:
        sb = get_supabase()
        row = {
            "command": "publish",
            "status": "pending",
            "payload": payload,
        }
        if user_id:
            row["user_id"] = user_id
        sb.table("bot_commands").insert(row).execute()
        logger.info(f"▶ 발행 명령 큐 등록 (title={req.title[:20]}, post_id={post_id})")
    except Exception as e:
        update_post_status(post_id, "failed")
        logger.error(f"발행 명령 큐 등록 실패: {e}")
        raise HTTPException(status_code=500, detail="발행 명령 큐 등록 실패")

    return PublishResponse(
        success=True, post_id=post_id,
        message="발행이 큐에 등록되었습니다. 워커가 처리 후 알림을 보냅니다.",
    )


@app.get("/status", response_model=StatusResponse)
async def get_status(_=Depends(_verify_token)):
    """오늘 댓글 봇 현황 조회"""
    from src.storage.supabase_client import (
        get_bot_settings_sb,
        get_pending_count_sb,
        get_recent_runs_sb,
    )

    settings = get_bot_settings_sb()
    retry_targets = get_retry_targets()
    runs = get_recent_runs_sb(limit=1)
    last_run = runs[0] if runs else None

    return StatusResponse(
        today_comments=count_today_comments(),
        today_bloggers=count_today_bloggers(),
        comment_bot_running=_comment_bot_task is not None
        and not _comment_bot_task.done(),
        retry_queue_count=len(retry_targets),
        pending_count=get_pending_count_sb(),
        approval_mode=settings.get("approval_mode", "manual"),
        last_run=last_run,
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


class RetryResponse(BaseModel):
    success: bool
    total: int = 0
    success_count: int = 0  # JSON 키: success
    failed_count: int = 0   # JSON 키: failed
    message: str = ""


@app.post("/comment/retry", response_model=RetryResponse)
async def retry_failed_comments(_=Depends(_verify_token)):
    """재시도 큐 댓글 일괄 실행"""
    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login
    from src.commenter.comment_writer import write_comment
    from src.storage.database import record_comment
    from src.utils.browser import create_browser

    targets = get_retry_targets()
    if not targets:
        return RetryResponse(success=True, total=0, message="재시도 대상 없음")

    naver_id = os.environ.get("NAVER_ID", "")
    naver_pw = os.environ.get("NAVER_PW", "")

    if not all([naver_id, naver_pw]):
        raise HTTPException(status_code=500, detail=".env 인증 정보 누락")

    total = len(targets)
    success_count = 0
    failed_count = 0

    logger.info(f"▶ 재시도 실행 시작: 총 {total}건")

    try:
        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)

            try:
                logged_in = await ensure_login(context, page, naver_id, naver_pw)
                if not logged_in:
                    return RetryResponse(
                        success=False, total=total, message="네이버 로그인 실패",
                    )

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
                            naver_id=naver_id,
                            naver_pw=naver_pw,
                        )
                        if ok:
                            remove_from_retry_queue(target["post_url"])
                            record_comment(
                                target["post_url"], target["blog_id"],
                                target["post_title"], "", True,
                            )
                            success_count += 1
                            logger.info(f"✓ 재시도 [{i}/{total}] 성공")
                        else:
                            add_to_retry_queue(
                                target["blog_id"], target["post_url"],
                                target["post_title"], "재시도 실패",
                            )
                            failed_count += 1
                            logger.warning(f"✗ 재시도 [{i}/{total}] 실패")
                    except Exception as e:
                        add_to_retry_queue(
                            target["blog_id"], target["post_url"],
                            target["post_title"], str(e)[:100],
                        )
                        failed_count += 1
                        logger.error(f"✗ 재시도 [{i}/{total}] 예외: {e}")

                    if i < total:
                        await asyncio.sleep(3)
            finally:
                await browser.close()

    except Exception as e:
        logger.error(f"재시도 실행 중 오류: {e}", exc_info=True)
        return RetryResponse(
            success=False, total=total,
            success_count=success_count, failed_count=failed_count,
            message=f"실행 중 오류: {str(e)[:100]}",
        )

    return RetryResponse(
        success=True, total=total,
        success_count=success_count, failed_count=failed_count,
        message=f"재시도 완료: 성공 {success_count} / 실패 {failed_count}",
    )


@app.post("/comment/execute", response_model=CommentExecuteResponse)
async def execute_pending_comments(
    req: CommentExecuteRequest, _=Depends(_verify_token)
):
    """
    승인된 댓글 일괄 실행 → 워커 큐로 오프로드.

    이전: API 핸들러에서 브라우저 직접 실행 (30분 블로킹)
    현재: bot_commands 큐에 execute 명령 삽입 → 워커가 비동기 처리
    """
    from src.storage.supabase_client import get_pending_comments_sb, get_supabase

    # 승인된 댓글 존재 여부만 확인
    approved_comments = get_pending_comments_sb("approved")
    if not approved_comments:
        return CommentExecuteResponse(
            success=True, total=0, message="승인된 댓글이 없습니다"
        )

    total = len(approved_comments)

    # 워커 큐에 execute 명령 삽입
    try:
        sb = get_supabase()
        result = sb.table("bot_commands").insert({
            "command": "execute",
            "status": "pending",
        }).execute()
        command_id = result.data[0]["id"] if result.data else None
        logger.info(f"▶ 댓글 실행 명령 큐 등록 (총 {total}개, cmd={command_id})")
    except Exception as e:
        logger.error(f"명령 큐 등록 실패: {e}")
        return CommentExecuteResponse(
            success=False, total=total,
            message=f"명령 큐 등록 실패: {str(e)[:100]}"
        )

    return CommentExecuteResponse(
        success=True,
        total=total,
        message=f"댓글 {total}개 실행이 큐에 등록되었습니다. 워커가 순차 처리합니다.",
        command_id=command_id,
    )


@app.get("/comment/progress/{command_id}")
async def get_comment_progress(command_id: str, _=Depends(_verify_token)):
    """
    댓글 게시 진행률 조회.

    워커가 bot_commands.result에 저장하는 {progress, total, success, failed} 반환.
    웹 UI에서 polling으로 호출.
    """
    import re as _re
    from src.storage.supabase_client import get_supabase

    # UUID 형식 검증 (SQL 인젝션 방지)
    if not _re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", command_id):
        raise HTTPException(status_code=404, detail="명령을 찾을 수 없습니다")

    sb = get_supabase()
    try:
        result = (
            sb.table("bot_commands")
            .select("status, result, error_message")
            .eq("id", command_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error(f"진행률 조회 실패: {e}")
        raise HTTPException(status_code=500, detail="서버 오류")

    if not result.data:
        raise HTTPException(status_code=404, detail="명령을 찾을 수 없습니다")

    row = result.data[0]
    progress = row.get("result") or {}

    return {
        "status": row["status"],
        "progress": progress.get("progress", 0),
        "total": progress.get("total", 0),
        "success": progress.get("success", 0),
        "failed": progress.get("failed", 0),
        "error_message": row.get("error_message"),
    }


async def _send_publish_notification(
    chat_id: int,
    title: str,
    post_url: str,
) -> None:
    """게시물 발행 완료 텔레그램 알림."""
    import httpx

    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN 미설정, 발행 알림 스킵")
        return

    message = (
        f"✅ <b>게시물 발행 완료</b>\n\n"
        f"📝 <b>제목:</b> {title}\n"
        f"🔗 <a href=\"{post_url}\">블로그에서 보기</a>"
    )

    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": message,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": False,
                },
                timeout=10,
            )
        logger.info(f"✓ 발행 알림 발송 완료 (chat_id: {chat_id})")
    except Exception as e:
        logger.warning(f"발행 알림 발송 실패: {e}")


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

"""
텔레그램 봇 — 멀티유저 + 댓글봇 + 이웃관리 + AI 초안 통합

기능:
  [게시물] 사진 전송 → AI 초안 생성 → HTML 프리뷰
  [댓글]   /pending → 인라인 버튼 승인/거부 → /execute 일괄 게시
  [이웃]   /discover, /visit, /neighbor, /all
  [설정]   /settings, /set_mode, /set_weekday, /set_weekend
  [큐]     /run, /execute, /retry → bot_commands 큐 등록 → 완료 알림

멀티유저:
  /start → 블로그 ID 입력 → chat_id 자동 등록
  모든 명령은 chat_id → user_id 매핑 후 실행

실행:
  source .venv/bin/activate
  python telegram_bot.py
"""
import os
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

import httpx

from src.utils.logger import get_telegram_logger

logger = get_telegram_logger()
from src.utils.photo_marker import render_html_segments, strip_markers

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

if not BOT_TOKEN:
    print("오류: .env에 TELEGRAM_BOT_TOKEN이 필요합니다")
    sys.exit(1)

BASE_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"
FILE_URL = f"https://api.telegram.org/file/bot{BOT_TOKEN}"
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

MEDIA_GROUP_WAIT = 2.0
_media_groups: dict[str, dict] = {}

# /start 등록 상태 머신 (chat_id → 상태)
_registration_state: dict[str, str] = {}

# user_id 캐시 (chat_id → user_id)
_user_cache: dict[str, str] = {}


# ───────────────────────────────────────────────
# 멀티유저 인증
# ───────────────────────────────────────────────

def _resolve_user(chat_id: str) -> str | None:
    """chat_id → user_id 매핑. 캐시 사용."""
    if chat_id in _user_cache:
        return _user_cache[chat_id]

    from src.storage.supabase_client import get_user_by_chat_id
    user = get_user_by_chat_id(str(chat_id))
    if user:
        _user_cache[str(chat_id)] = user["user_id"]
        return user["user_id"]
    return None


# ───────────────────────────────────────────────
# 유틸리티
# ───────────────────────────────────────────────

def _run_async(coro):
    """동기 컨텍스트에서 async 함수 실행"""
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        if loop.is_running():
            asyncio.create_task(coro)
            return None
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


def _send_message(chat_id: int, text: str, parse_mode: str = "HTML", reply_markup: dict | None = None) -> None:
    """텔레그램 메시지 전송"""
    if len(text) > 4000:
        text = text[:4000] + "\n\n...(이하 생략)"
    try:
        payload = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        httpx.post(f"{BASE_URL}/sendMessage", json=payload, timeout=10)
    except Exception as e:
        logger.warning(f"메시지 전송 실패: {e}")


def _send_document(chat_id: int, file_path: Path, caption: str = "") -> None:
    """파일 전송"""
    try:
        with open(file_path, "rb") as f:
            files = {"document": (file_path.name, f, "text/html")}
            data = {"chat_id": chat_id, "caption": caption}
            httpx.post(f"{BASE_URL}/sendDocument", data=data, files=files, timeout=30)
    except Exception as e:
        logger.error(f"파일 전송 실패: {e}")


def _answer_callback(query_id: str, text: str = None) -> None:
    """Inline Keyboard 콜백 응답"""
    try:
        payload = {"callback_query_id": query_id}
        if text:
            payload["text"] = text
        httpx.post(f"{BASE_URL}/answerCallbackQuery", json=payload, timeout=10)
    except Exception as e:
        logger.warning(f"콜백 응답 실패: {e}")


def _download_photo(file_id: str) -> str | None:
    """사진 다운로드"""
    try:
        r = httpx.get(f"{BASE_URL}/getFile", params={"file_id": file_id}, timeout=10)
        file_path = r.json()["result"]["file_path"]
        r = httpx.get(f"{FILE_URL}/{file_path}", timeout=30)
        ext = Path(file_path).suffix or ".jpg"
        local_path = f"/tmp/tg_photo_{int(time.time() * 1000)}{ext}"
        Path(local_path).write_bytes(r.content)
        return local_path
    except Exception as e:
        logger.error(f"사진 다운로드 실패: {e}")
        return None


def _handle_retry_command(chat_id: int, command_id: str, query_id: str) -> None:
    """실패한 명령을 pending으로 복구하여 재시도."""
    _answer_callback(query_id, "재시도 중...")
    try:
        from src.storage.supabase_client import get_supabase
        sb = get_supabase()
        result = (
            sb.table("bot_commands")
            .update({
                "status": "pending",
                "error_message": None,
                "started_at": None,
                "completed_at": None,
            })
            .eq("id", command_id)
            .eq("status", "failed")
            .execute()
        )
        if result.data:
            cmd_type = result.data[0].get("command", "?")
            _send_message(chat_id, f"🔄 <b>{cmd_type}</b> 명령을 재시도합니다.")
        else:
            _send_message(chat_id, "⚠️ 이미 처리되었거나 재시도할 수 없는 명령입니다.")
    except Exception as e:
        _send_message(chat_id, f"❌ 재시도 실패: {e}")


def _enqueue_command(user_id: str, command: str, payload: dict | None = None) -> bool:
    """bot_commands 큐에 명령 등록."""
    try:
        from src.storage.supabase_client import get_supabase
        sb = get_supabase()
        row = {
            "user_id": user_id,
            "command": command,
            "status": "pending",
        }
        if payload:
            row["payload"] = payload
        sb.table("bot_commands").insert(row).execute()
        logger.info(f"명령 큐 등록: {command} (user={user_id[:8]})")
        return True
    except Exception as e:
        logger.error(f"명령 큐 등록 실패: {e}")
        return False


# ───────────────────────────────────────────────
# HTML 프리뷰 생성
# ───────────────────────────────────────────────

def _generate_html(title: str, body: str, hashtags: list[str], category: str | None, image_paths: list[str]) -> Path:
    """HTML 프리뷰 생성"""
    content_html = render_html_segments(body, image_paths)
    tags_html = " ".join(f'<span class="tag">#{t}</span>' for t in hashtags)

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: 'Nanum Gothic', '나눔고딕', sans-serif; font-size: 16px; line-height: 1.8; color: #333; background: #f5f5f5; padding: 20px; }}
  .container {{ max-width: 700px; margin: 0 auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }}
  .header {{ background: #03c75a; color: #fff; padding: 12px 20px; font-size: 13px; display: flex; justify-content: space-between; }}
  .title {{ font-size: 22px; font-weight: bold; padding: 24px 24px 8px; color: #222; }}
  .meta {{ padding: 0 24px 16px; font-size: 12px; color: #999; border-bottom: 1px solid #eee; }}
  .body {{ padding: 24px; }}
  .body p {{ margin-bottom: 12px; }}
  .photo {{ margin: 16px 24px; text-align: center; }}
  .photo img {{ max-width: 100%; border-radius: 4px; border: 1px solid #eee; }}
  .tags {{ padding: 16px 24px; border-top: 1px solid #eee; }}
  .tag {{ display: inline-block; background: #f0f7f0; color: #03c75a; padding: 4px 10px; margin: 3px; border-radius: 20px; font-size: 13px; }}
  .footer {{ padding: 12px 24px; background: #fafafa; border-top: 1px solid #eee; font-size: 11px; color: #aaa; text-align: center; }}
</style>
</head>
<body>
<div class="container">
  <div class="header"><span>블로그</span><span>{category or '미분류'}</span></div>
  <div class="title">{title}</div>
  <div class="meta">{datetime.now().strftime('%Y. %m. %d. %H:%M')} | AI 초안</div>
  <div class="body">{content_html}</div>
  <div class="tags">{tags_html}</div>
  <div class="footer">AI가 생성한 초안입니다.</div>
</div>
</body>
</html>"""

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = OUTPUT_DIR / f"preview_{timestamp}.html"
    output_path.write_text(html, encoding="utf-8")
    return output_path


# ───────────────────────────────────────────────
# 사진 처리 (AI 초안)
# ───────────────────────────────────────────────

def _process_photos(chat_id: int, photo_file_ids: list[str], caption: str, user_id: str | None = None) -> None:
    """사진 처리 → AI 생성 → HTML"""
    count = len(photo_file_ids)
    _send_message(chat_id, f"사진 {count}장 수신. AI 초안 생성 중... (30초~1분)")

    local_paths = []
    for file_id in photo_file_ids:
        path = _download_photo(file_id)
        if path:
            local_paths.append(path)
        time.sleep(0.1)

    if not local_paths:
        _send_message(chat_id, "사진 다운로드 실패.")
        return

    try:
        from src.ai.content_generator import generate_post
        result = generate_post(local_paths, caption)
    except Exception as e:
        logger.error(f"AI 생성 실패: {e}")
        _send_message(chat_id, f"AI 생성 오류: {e}")
        return

    title, body, hashtags, category = result["title"], result["body"], result["hashtags"], result.get("category")
    html_path = _generate_html(title, body, hashtags, category, local_paths)

    tags_str = " ".join(f"#{t}" for t in hashtags[:10])

    # Supabase에 저장
    saved_id = None
    try:
        from src.storage.supabase_client import save_generation
        saved_id = save_generation(
            title=title,
            body=body,
            hashtags=hashtags,
            category=category,
            memo=caption or None,
            photo_paths=local_paths,
            html=html_path.read_text(encoding="utf-8"),
            source="telegram",
            user_id=user_id,
        )
    except Exception as e:
        logger.warning(f"Supabase 저장 실패 (텔레그램 전송은 계속): {e}")

    db_note = " | 웹 대시보드 동기화 완료" if saved_id else ""
    _send_message(
        chat_id,
        f"<b>[{category}] 초안 완료 (사진 {len(local_paths)}장)</b>\n\n"
        f"<b>제목:</b> {title}\n\n"
        f"<b>해시태그 ({len(hashtags)}개):</b> {tags_str}\n\n"
        f"📎 HTML 파일 첨부됩니다{db_note}"
    )
    _send_document(chat_id, html_path, caption=f"{title}.html")


def _flush_media_group(group_id: str) -> None:
    group = _media_groups.pop(group_id, None)
    if not group:
        return
    _process_photos(group["chat_id"], group["photos"], group["caption"], group.get("user_id"))


def _check_media_groups() -> None:
    now = time.time()
    expired = [gid for gid, g in _media_groups.items() if now - g["last_seen"] >= MEDIA_GROUP_WAIT]
    for gid in expired:
        _flush_media_group(gid)


# ───────────────────────────────────────────────
# 댓글 승인 workflow (Inline Keyboard)
# ───────────────────────────────────────────────

async def _preview_comment_with_buttons(chat_id: int, blog_id: str, user_id: str | None = None) -> None:
    """댓글 초안 미리보기 + 승인/거부 버튼"""
    _send_message(chat_id, f"🔍 {blog_id} 블로그 분석 중...")

    try:
        from playwright.async_api import async_playwright
        from src.collectors.post_collector import collect_posts
        from src.commenter.comment_writer import _extract_post_body
        from src.commenter.ai_comment import generate_comment
        from src.utils.browser import create_browser
        from src.auth.naver_login import ensure_login, ensure_login_cookie_only
        from src.storage.supabase_client import add_pending_comment_sb

        async with async_playwright() as pw:
            browser, context, page = await create_browser(pw, headless=True)
            try:
                # 로그인: user_id가 있으면 쿠키, 없으면 ID/PW
                if user_id:
                    logged_in = await ensure_login_cookie_only(context, page, user_id)
                else:
                    naver_id = os.environ.get("NAVER_ID", "")
                    naver_pw = os.environ.get("NAVER_PW", "")
                    logged_in = await ensure_login(context, page, naver_id, naver_pw)

                if not logged_in:
                    _send_message(chat_id, "❌ 로그인 실패")
                    return

                posts = await collect_posts(page, blog_id)
                if not posts:
                    _send_message(chat_id, f"❌ {blog_id}: 게시물 없음")
                    return

                post_url, post_title = posts[0]
                await page.goto(post_url, timeout=30_000)
                import asyncio
                await asyncio.sleep(2)

                target_frame = page.frame("mainFrame") or page.main_frame
                post_body = await _extract_post_body(target_frame)
                comment_draft = generate_comment(post_body, post_title, recent_comments=[])

                comment_id = add_pending_comment_sb(
                    blog_id, post_url, post_title, comment_draft, user_id=user_id,
                )

                keyboard = {
                    "inline_keyboard": [
                        [
                            {"text": "✅ 승인", "callback_data": f"approve:{comment_id}"},
                            {"text": "❌ 거부", "callback_data": f"reject:{comment_id}"},
                        ],
                        [
                            {"text": "✏️ 수정", "callback_data": f"edit:{comment_id}"},
                        ]
                    ]
                }

                _send_message(
                    chat_id,
                    f"<b>💬 댓글 초안</b>\n\n"
                    f"<b>대상:</b> {blog_id}\n"
                    f"<b>게시물:</b> {post_title[:50]}...\n\n"
                    f"<b>댓글:</b>\n<code>{comment_draft}</code>\n\n"
                    f"<b>길이:</b> {len(comment_draft)}자",
                    reply_markup=keyboard
                )

            finally:
                await browser.close()

    except Exception as e:
        logger.error(f"댓글 미리보기 실패: {e}")
        _send_message(chat_id, f"❌ 오류: {e}")


def _handle_approval(chat_id: int, comment_id: str, action: str, query_id: str = None) -> None:
    """승인/거부/수정 처리."""
    from src.storage.supabase_client import update_pending_status_sb

    if query_id:
        _answer_callback(query_id, "처리 중...")

    if action == "reject":
        updated = update_pending_status_sb(comment_id, "rejected", decided_by="telegram")
        if updated:
            _send_message(chat_id, "❌ 댓글이 거부되었습니다.")
        else:
            _send_message(chat_id, "⚠️ 이미 처리된 댓글이거나 찾을 수 없습니다.")
        return

    if action == "edit":
        _send_message(chat_id, f"✏️ 수정할 내용을 입력하세요:\n/edit_text:{comment_id} [새로운 댓글]")
        return

    # 승인
    updated = update_pending_status_sb(comment_id, "approved", decided_by="telegram")
    if not updated:
        _send_message(chat_id, "⚠️ 이미 처리되었거나 취소된 댓글입니다.")
        return

    _send_message(
        chat_id,
        f"✅ <b>댓글이 승인되었습니다</b>\n\n"
        f"💬 댓글은 '실행 대기 큐'에 저장되었습니다.\n"
        f"📊 <code>/execute</code> 명령으로 일괄 작성하세요."
    )


async def _edit_and_approve(chat_id: int, comment_id: str, new_text: str, user_id: str | None = None) -> None:
    """수정 후 승인"""
    from src.storage.supabase_client import (
        get_pending_comments_sb,
        update_pending_status_sb,
        add_pending_comment_sb,
    )

    old = None
    for p in get_pending_comments_sb("pending", user_id=user_id):
        if p["id"] == comment_id:
            old = p
            break

    if not old:
        _send_message(chat_id, "❌ 원본 댓글을 찾을 수 없습니다.")
        return

    update_pending_status_sb(comment_id, "rejected", decided_by="telegram")
    new_id = add_pending_comment_sb(
        old["blog_id"], old["post_url"], old["post_title"], new_text, user_id=user_id,
    )

    if new_id:
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "✅ 승인", "callback_data": f"approve:{new_id}"},
                    {"text": "❌ 거부", "callback_data": f"reject:{new_id}"},
                ],
            ]
        }
        _send_message(
            chat_id,
            f"✏️ <b>수정 완료</b>\n\n"
            f"💬 <code>{new_text}</code>\n\n"
            f"아래 버튼으로 승인하세요:",
            reply_markup=keyboard
        )
    else:
        _send_message(chat_id, "❌ 수정본 저장에 실패했습니다.")


# ───────────────────────────────────────────────
# 설정 명령어
# ───────────────────────────────────────────────

def _show_settings(chat_id: int, user_id: str | None = None) -> None:
    """현재 설정 표시"""
    from src.storage.supabase_client import get_bot_settings_sb

    settings = get_bot_settings_sb(user_id=user_id)

    mode_emoji = "👤" if settings.get("approval_mode") == "manual" else "🤖"
    weekday = settings.get("weekday_hours", {"start": 20, "end": 24})
    weekend = settings.get("weekend_hours", {"start": 13, "end": 18})
    active = "🟢 활성" if settings.get("is_active", True) else "🔴 비활성"

    text = (
        f"<b>⚙️ 현재 설정</b>\n\n"
        f"{mode_emoji} <b>승인 모드:</b> {settings.get('approval_mode', 'manual')}\n"
        f"📅 <b>평일 시간:</b> {weekday['start']}:00 ~ {weekday['end']}:00\n"
        f"🌴 <b>주말 시간:</b> {weekend['start']}:00 ~ {weekend['end']}:00\n"
        f"📊 <b>일일 한도:</b> 댓글 {settings.get('max_comments_per_day', 30)}개 / 블로거 {settings.get('max_bloggers_per_day', 10)}명\n"
        f"🤖 <b>봇 상태:</b> {active}\n\n"
        f"<b>명령어:</b>\n"
        f"/set_mode manual|auto\n"
        f"/set_weekday 20 24\n"
        f"/set_weekend 13 18"
    )
    _send_message(chat_id, text)


def _set_mode(chat_id: int, mode: str, user_id: str | None = None) -> None:
    """승인 모드 설정"""
    if mode not in ("manual", "auto"):
        _send_message(chat_id, "❌ 사용법: /set_mode manual 또는 /set_mode auto")
        return

    from src.storage.supabase_client import update_bot_settings_sb
    update_bot_settings_sb(user_id=user_id, approval_mode=mode)

    emoji = "👤" if mode == "manual" else "🤖"
    _send_message(chat_id, f"{emoji} 승인 모드가 <b>{mode}</b>로 변경되었습니다.")


def _set_weekday(chat_id: int, start: str, end: str, user_id: str | None = None) -> None:
    """평일 시간대 설정"""
    try:
        s, e = int(start), int(end)
        if not (0 <= s < 24 and 0 <= e <= 24 and s < e):
            raise ValueError
        from src.storage.supabase_client import update_bot_settings_sb
        update_bot_settings_sb(user_id=user_id, weekday_hours={"start": s, "end": e})
        _send_message(chat_id, f"📅 평일 시간대: <b>{s}:00 ~ {e}:00</b>로 설정되었습니다.")
    except ValueError:
        _send_message(chat_id, "❌ 사용법: /set_weekday 20 24 (시작 종료, 0~24)")


def _set_weekend(chat_id: int, start: str, end: str, user_id: str | None = None) -> None:
    """주말 시간대 설정"""
    try:
        s, e = int(start), int(end)
        if not (0 <= s < 24 and 0 <= e <= 24 and s < e):
            raise ValueError
        from src.storage.supabase_client import update_bot_settings_sb
        update_bot_settings_sb(user_id=user_id, weekend_hours={"start": s, "end": e})
        _send_message(chat_id, f"🌴 주말 시간대: <b>{s}:00 ~ {e}:00</b>로 설정되었습니다.")
    except ValueError:
        _send_message(chat_id, "❌ 사용법: /set_weekend 13 18 (시작 종료, 0~24)")


def _send_html_file(chat_id: int) -> None:
    """최신 HTML 파일 전송"""
    html_files = sorted(OUTPUT_DIR.glob("preview_*.html"), key=lambda x: x.stat().st_mtime, reverse=True)
    if not html_files:
        _send_message(chat_id, "❌ HTML 파일이 없습니다.")
        return
    _send_document(chat_id, html_files[0], caption="📄 HTML 프리뷰")


# ───────────────────────────────────────────────
# 현황/목록 표시
# ───────────────────────────────────────────────

async def _show_pending_list_async(chat_id: int, user_id: str | None = None) -> None:
    """승인 대기 목록 표시 - 3개씩 묶어서 표시"""
    import asyncio
    from src.storage.supabase_client import get_pending_comments_sb

    _send_message(chat_id, "⏳ 목록을 불러오는 중...")

    try:
        pending = get_pending_comments_sb("pending", user_id=user_id)
    except Exception as e:
        logger.error(f"pending 목록 조회 실패: {e}")
        _send_message(chat_id, f"❌ 목록 조회 실패: {e}")
        return

    if not pending:
        _send_message(chat_id, "📭 승인 대기 중인 댓글이 없습니다.")
        return

    total = len(pending)
    _send_message(
        chat_id,
        f"<b>📋 승인 대기 댓글: 총 {total}개</b>\n"
        f"✅ 승인 후 <code>/execute</code>로 일괄 작성하세요"
    )

    chunk_size = 3
    messages = []

    for chunk_start in range(0, total, chunk_size):
        chunk = pending[chunk_start:chunk_start + chunk_size]
        chunk_num = chunk_start // chunk_size + 1
        total_chunks = (total + chunk_size - 1) // chunk_size

        comments_text = []
        for i, p in enumerate(chunk, chunk_start + 1):
            comments_text.append(
                f"<b>{i}. {p['blog_id']}</b>\n"
                f"<code>{p['comment_text'][:60]}{'...' if len(p['comment_text']) > 60 else ''}</code> "
                f"({len(p['comment_text'])}자)"
            )

        keyboard_rows = []
        for p in chunk:
            keyboard_rows.append([
                {"text": "✅ 승인", "callback_data": f"approve:{p['id']}"},
                {"text": "❌ 거부", "callback_data": f"reject:{p['id']}"},
            ])

        keyboard = {"inline_keyboard": keyboard_rows}
        text = (
            f"<b>[{chunk_num}/{total_chunks}]</b>\n"
            + "\n\n".join(comments_text)
        )
        messages.append((text, keyboard))

    for text, keyboard in messages:
        _send_message(chat_id, text, reply_markup=keyboard)
        await asyncio.sleep(0.1)


def _show_pending_list(chat_id: int, user_id: str | None = None) -> None:
    """동기 래퍼"""
    _run_async(_show_pending_list_async(chat_id, user_id=user_id))


def _show_status(chat_id: int, user_id: str | None = None) -> None:
    """현황 표시"""
    from src.storage.database import count_today_comments, count_today_bloggers, init_db, get_comment_quality_stats
    from src.storage.database import get_retry_targets
    from src.storage.supabase_client import get_pending_count_sb, get_recent_runs_sb

    init_db(user_id=user_id)
    stats = get_comment_quality_stats(days=1, user_id=user_id)
    pending_count = get_pending_count_sb(user_id=user_id)
    retry_count = len(get_retry_targets(user_id=user_id))
    recent_runs = get_recent_runs_sb(limit=1, user_id=user_id)

    last_run_text = "없음"
    if recent_runs:
        r = recent_runs[0]
        run_at = r.get("run_at", "")[:16].replace("T", " ")
        last_run_text = f"{run_at} ({r.get('bloggers_visited', 0)}명/{r.get('comments_written', 0)}댓글)"

    text = (
        f"<b>📊 오늘 현황</b>\n"
        f"댓글: {stats['success_count']}개 (성공률 {stats['success_rate']:.0f}%)\n"
        f"방문: {count_today_bloggers(user_id=user_id)}명\n"
        f"평균 길이: {stats['avg_length']}자\n\n"
        f"<b>⏳ 대기 중</b>\n"
        f"승인 대기: {pending_count}개\n"
        f"재시도 예정: {retry_count}개\n\n"
        f"<b>🕐 마지막 실행</b>\n"
        f"{last_run_text}"
    )
    _send_message(chat_id, text)


# ───────────────────────────────────────────────
# /start 등록 플로우
# ───────────────────────────────────────────────

def _handle_start(chat_id: int) -> None:
    """
    /start → 이미 등록된 사용자면 환영, 미등록이면 블로그 ID 입력 요청.
    """
    user_id = _resolve_user(str(chat_id))
    if user_id:
        _send_message(
            chat_id,
            "✅ 이미 등록된 사용자입니다.\n/help로 명령어를 확인하세요."
        )
        return

    _registration_state[str(chat_id)] = "awaiting_blog_id"
    _send_message(
        chat_id,
        "👋 <b>블로그 자동화 봇</b>에 오신 걸 환영합니다!\n\n"
        "등록을 위해 <b>네이버 블로그 ID</b>를 입력해주세요.\n"
        "(예: myblog123)"
    )


def _handle_registration(chat_id: int, text: str) -> bool:
    """
    등록 상태 머신 처리. 등록 중이면 True 반환.
    """
    state = _registration_state.get(str(chat_id))
    if state != "awaiting_blog_id":
        return False

    blog_id = text.strip()
    if not blog_id or blog_id.startswith("/"):
        _send_message(chat_id, "❌ 유효한 블로그 ID를 입력해주세요.")
        return True

    from src.storage.supabase_client import register_chat_id
    success = register_chat_id(blog_id, str(chat_id))

    if success:
        _registration_state.pop(str(chat_id), None)
        # 캐시 갱신
        user_id = _resolve_user(str(chat_id))
        _send_message(
            chat_id,
            f"✅ <b>등록 완료!</b>\n\n"
            f"블로그 ID: <code>{blog_id}</code>\n\n"
            f"/help로 사용 가능한 명령어를 확인하세요."
        )
    else:
        _send_message(
            chat_id,
            f"❌ 등록되지 않은 블로그 ID입니다: <code>{blog_id}</code>\n\n"
            f"웹에서 먼저 가입 후 다시 시도해주세요.\n"
            f"다시 입력하거나 /cancel로 취소하세요."
        )

    return True


# ───────────────────────────────────────────────
# 명령어 처리
# ───────────────────────────────────────────────

def _handle_command(chat_id: int, text: str) -> None:
    """명령어 처리"""
    parts = text.strip().split(maxsplit=2)
    cmd = parts[0].lower()
    arg1 = parts[1] if len(parts) > 1 else ""
    arg2 = parts[2] if len(parts) > 2 else ""

    # /start는 미등록자도 사용 가능
    if cmd == "/start":
        _handle_start(chat_id)
        return

    # /cancel은 등록 취소
    if cmd == "/cancel":
        if _registration_state.pop(str(chat_id), None):
            _send_message(chat_id, "등록이 취소되었습니다.")
        return

    # 멀티유저 인증
    user_id = _resolve_user(str(chat_id))
    if not user_id:
        _send_message(chat_id, "❌ 등록되지 않은 사용자입니다.\n/start로 등록해주세요.")
        return

    if cmd == "/help":
        _send_message(
            chat_id,
            "<b>🤖 블로그 자동화 봇</b>\n\n"
            "<b>[게시물]</b>\n"
            "사진 전송 → AI 초안 → HTML 프리뷰\n"
            "/send_html - 최신 HTML 전송\n\n"
            "<b>[댓글]</b>\n"
            "/preview_comment {blog_id} - 초안 확인\n"
            "/pending - 승인 대기 목록\n"
            "/execute - 승인된 댓글 일괄 작성\n"
            "/retry - 재시도 실행\n\n"
            "<b>[봇 실행]</b>\n"
            "/run - 봇 1회 실행\n\n"
            "<b>[이웃 관리]</b>\n"
            "/discover 키워드1,키워드2 - 이웃 발견\n"
            "/visit - 이웃 방문\n"
            "/neighbor blog_id - 서로이웃 신청\n"
            "/all 키워드 - 찾기+방문 한번에\n\n"
            "<b>[설정]</b>\n"
            "/settings - 현재 설정\n"
            "/set_mode manual|auto\n"
            "/set_weekday 20 24\n"
            "/set_weekend 13 18\n\n"
            "/status - 현황"
        )

    elif cmd == "/status":
        _show_status(chat_id, user_id=user_id)

    elif cmd == "/settings":
        _show_settings(chat_id, user_id=user_id)

    elif cmd == "/set_mode":
        _set_mode(chat_id, arg1, user_id=user_id)

    elif cmd == "/set_weekday":
        _set_weekday(chat_id, arg1, arg2, user_id=user_id)

    elif cmd == "/set_weekend":
        _set_weekend(chat_id, arg1, arg2, user_id=user_id)

    elif cmd == "/preview_comment":
        if not arg1:
            _send_message(chat_id, "사용법: /preview_comment {blog_id}")
            return
        _run_async(_preview_comment_with_buttons(chat_id, arg1, user_id=user_id))

    elif cmd == "/pending":
        _show_pending_list(chat_id, user_id=user_id)

    elif cmd == "/execute":
        if _enqueue_command(user_id, "execute"):
            _send_message(chat_id, "⏳ <b>execute</b> 명령이 등록되었습니다. 완료 시 알려드릴게요.")
        else:
            _send_message(chat_id, "❌ 명령 등록에 실패했습니다.")

    elif cmd == "/run":
        if _enqueue_command(user_id, "run"):
            _send_message(chat_id, "⏳ <b>run</b> 명령이 등록되었습니다. 완료 시 알려드릴게요.")
        else:
            _send_message(chat_id, "❌ 명령 등록에 실패했습니다.")

    elif cmd == "/retry":
        if _enqueue_command(user_id, "retry"):
            _send_message(chat_id, "⏳ <b>retry</b> 명령이 등록되었습니다. 완료 시 알려드릴게요.")
        else:
            _send_message(chat_id, "❌ 명령 등록에 실패했습니다.")

    elif cmd == "/discover":
        if not arg1:
            _send_message(chat_id, "사용법: /discover 키워드1,키워드2")
            return
        # arg1 + arg2를 합쳐서 키워드 추출
        raw = (arg1 + " " + arg2).strip() if arg2 else arg1
        keywords = [k.strip() for k in raw.replace(",", " ").split() if k.strip()]
        if _enqueue_command(user_id, "discover_neighbors", {"keywords": keywords}):
            _send_message(chat_id, f"⏳ <b>이웃 발견</b> 명령이 등록되었습니다.\n키워드: {', '.join(keywords)}\n완료 시 알려드릴게요.")
        else:
            _send_message(chat_id, "❌ 명령 등록에 실패했습니다.")

    elif cmd == "/visit":
        if _enqueue_command(user_id, "visit_neighbors"):
            _send_message(chat_id, "⏳ <b>이웃 방문</b> 명령이 등록되었습니다. 완료 시 알려드릴게요.")
        else:
            _send_message(chat_id, "❌ 명령 등록에 실패했습니다.")

    elif cmd == "/neighbor":
        if not arg1:
            _send_message(chat_id, "사용법: /neighbor blog_id")
            return
        payload = {
            "target_blog_id": arg1,
            "message": "안녕하세요! 서로이웃 신청드립니다 😊",
        }
        if _enqueue_command(user_id, "neighbor_request", payload):
            _send_message(chat_id, f"⏳ <b>서로이웃 신청</b> 명령이 등록되었습니다.\n대상: {arg1}\n완료 시 알려드릴게요.")
        else:
            _send_message(chat_id, "❌ 명령 등록에 실패했습니다.")

    elif cmd == "/all":
        if not arg1:
            _send_message(chat_id, "사용법: /all 키워드1,키워드2")
            return
        raw = (arg1 + " " + arg2).strip() if arg2 else arg1
        keywords = [k.strip() for k in raw.replace(",", " ").split() if k.strip()]
        if _enqueue_command(user_id, "discover_and_visit", {"keywords": keywords}):
            _send_message(chat_id, f"⏳ <b>찾기+방문</b> 명령이 등록되었습니다.\n키워드: {', '.join(keywords)}\n완료 시 알려드릴게요.")
        else:
            _send_message(chat_id, "❌ 명령 등록에 실패했습니다.")

    elif cmd == "/send_html":
        _send_html_file(chat_id)

    elif cmd.startswith("/edit_text:"):
        try:
            comment_id = cmd.split(":", 1)[1]
            if not comment_id:
                raise ValueError("빈 ID")
            _run_async(_edit_and_approve(chat_id, comment_id, text[len(cmd):].strip(), user_id=user_id))
        except (ValueError, IndexError):
            _send_message(chat_id, "❌ 사용법: /edit_text:{id} [내용]")

    else:
        _send_message(chat_id, "알 수 없는 명령어. /help를 입력하세요.")


# ───────────────────────────────────────────────
# 메인 루프
# ───────────────────────────────────────────────

def main():
    print("=" * 50)
    print("  텔레그램 봇 시작 (멀티유저 + 이웃관리 통합)")
    print(f"  봇 토큰: ...{BOT_TOKEN[-8:]}")
    print("=" * 50)

    # DB 초기화
    from src.storage.database import init_db
    init_db()
    print("✅ DB 초기화 완료\n")

    offset = 0

    print("[DEBUG] 폴링 루프 시작")

    while True:
        try:
            _check_media_groups()
            poll_timeout = 2 if _media_groups else 30

            r = httpx.get(
                f"{BASE_URL}/getUpdates",
                params={
                    "offset": offset,
                    "timeout": poll_timeout,
                    "allowed_updates": '["message","callback_query"]'
                },
                timeout=poll_timeout + 5,
            )

            updates = r.json().get("result", [])

            for update in updates:
                offset = update["update_id"] + 1

                # Callback Query 처리
                if "callback_query" in update:
                    query = update["callback_query"]
                    chat_id = query["message"]["chat"]["id"]
                    data = query["data"]
                    query_id = query["id"]

                    # 콜백은 등록된 사용자만 처리
                    user_id = _resolve_user(str(chat_id))
                    if not user_id:
                        _answer_callback(query_id, "등록되지 않은 사용자입니다")
                        continue

                    print(f"[BOT] 콜백 수신: chat_id={chat_id}, data={data}")
                    if data.startswith("approve:"):
                        comment_id = data.split(":", 1)[1]
                        _handle_approval(chat_id, comment_id, "approve", query_id)
                    elif data.startswith("reject:"):
                        comment_id = data.split(":", 1)[1]
                        _handle_approval(chat_id, comment_id, "reject", query_id)
                    elif data.startswith("edit:"):
                        comment_id = data.split(":", 1)[1]
                        _handle_approval(chat_id, comment_id, "edit", query_id)
                    elif data.startswith("retry_cmd:"):
                        cmd_id = data.split(":", 1)[1]
                        _handle_retry_command(chat_id, cmd_id, query_id)
                    continue

                # 일반 메시지 처리
                message = update.get("message")
                if not message:
                    continue

                chat_id = message["chat"]["id"]

                # 등록 플로우 처리 (텍스트만)
                if "text" in message:
                    if _handle_registration(chat_id, message["text"]):
                        continue
                    _handle_command(chat_id, message["text"])
                    continue

                # 사진 처리 (등록된 사용자만)
                if "photo" in message:
                    user_id = _resolve_user(str(chat_id))
                    if not user_id:
                        _send_message(chat_id, "❌ 등록되지 않은 사용자입니다.\n/start로 등록해주세요.")
                        continue

                    file_id = message["photo"][-1]["file_id"]
                    caption = message.get("caption", "")
                    media_group_id = message.get("media_group_id")

                    if media_group_id:
                        if media_group_id not in _media_groups:
                            _media_groups[media_group_id] = {
                                "chat_id": chat_id,
                                "photos": [],
                                "caption": caption,
                                "last_seen": time.time(),
                                "user_id": user_id,
                            }
                        group = _media_groups[media_group_id]
                        group["photos"].append(file_id)
                        group["last_seen"] = time.time()
                        if not group["caption"] and caption:
                            group["caption"] = caption
                    else:
                        _process_photos(chat_id, [file_id], caption, user_id=user_id)

            _check_media_groups()

        except httpx.TimeoutException:
            _check_media_groups()
            continue
        except KeyboardInterrupt:
            for gid in list(_media_groups.keys()):
                _flush_media_group(gid)
            print("\n봇 종료.")
            break
        except Exception as e:
            logger.error(f"폴링 오류: {e}")
            time.sleep(5)


if __name__ == "__main__":
    main()

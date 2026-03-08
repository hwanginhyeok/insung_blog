#!/usr/bin/env python3
"""
간단한 텔레그램 봇 - 승인 취합 테스트용
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

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ALLOWED_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
BASE_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

# 승인된 댓글 저장
_approved_comments: dict[int, list] = {}  # chat_id -> [comments]


def send_message(chat_id: int, text: str, reply_markup: dict = None):
    try:
        payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        httpx.post(f"{BASE_URL}/sendMessage", json=payload, timeout=10)
    except Exception as e:
        print(f"메시지 전송 실패: {e}")


def answer_callback(query_id: str, text: str = None):
    try:
        payload = {"callback_query_id": query_id}
        if text:
            payload["text"] = text
        httpx.post(f"{BASE_URL}/answerCallbackQuery", json=payload, timeout=10)
    except:
        pass


def show_pending(chat_id: int):
    """승인 대기 목록 표시 - 개별 메시지 + 버튼 (Supabase)"""
    from src.storage.supabase_client import get_pending_comments_sb

    pending = get_pending_comments_sb("pending")
    if not pending:
        send_message(chat_id, "📭 승인 대기 중인 댓글이 없습니다.")
        return
    
    total = len(pending)
    send_message(chat_id, f"<b>📋 승인 대기 댓글: 총 {total}개</b>\n\n아래에서 하나씩 확인하세요. 👇")
    
    for i, p in enumerate(pending, 1):
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "✅ 승인", "callback_data": f"approve:{p['id']}"},
                    {"text": "❌ 거부", "callback_data": f"reject:{p['id']}"},
                ]
            ]
        }
        
        text = (
            f"<b>📌 {i}/{total}번째 댓글</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"<b>📝 블로거:</b> {p['blog_id']}\n\n"
            f"<b>📄 게시물:</b> {p['post_title'][:50]}{'...' if len(p['post_title']) > 50 else ''}\n\n"
            f"<b>💬 댓글:</b>\n"
            f"<code>{p['comment_text']}</code>\n\n"
            f"<b>📊 길이:</b> {len(p['comment_text'])}자\n"
            f"━━━━━━━━━━━━━━━━━━━━━"
        )
        send_message(chat_id, text, keyboard)


def handle_approval(chat_id: int, comment_id: str, action: str, query_id: str = None):
    """승인/거부 처리 (Supabase, comment_id: UUID 문자열)"""
    from src.storage.supabase_client import get_pending_comments_sb, update_pending_status_sb

    if query_id:
        answer_callback(query_id, "처리 중...")

    if action == "reject":
        updated = update_pending_status_sb(comment_id, "rejected", decided_by="telegram")
        if updated:
            send_message(chat_id, "❌ 댓글이 거부되었습니다.")
        else:
            send_message(chat_id, "⚠️ 이미 처리된 댓글이거나 찾을 수 없습니다.")
        return

    # 승인 처리 — Supabase에서 조회
    pending = get_pending_comments_sb("pending")
    target = None
    for p in pending:
        if p["id"] == comment_id:
            target = p
            break

    if not target:
        send_message(chat_id, "❌ 댓글을 찾을 수 없습니다.")
        return

    # 취합 큐에 추가
    if chat_id not in _approved_comments:
        _approved_comments[chat_id] = []

    # 중복 체크
    if any(c["id"] == comment_id for c in _approved_comments[chat_id]):
        send_message(chat_id, "⚠️ 이미 승인된 댓글입니다.")
        return

    _approved_comments[chat_id].append({
        "id": comment_id,
        **target
    })

    approved_count = len(_approved_comments[chat_id])

    # 즉시 응답
    send_message(
        chat_id,
        f"✅ <b>작성 요청 완료!</b>\n\n"
        f"📝 블로거: {target['blog_id']}\n"
        f"💬 댓글: <code>{target['comment_text'][:40]}{'...' if len(target['comment_text']) > 40 else ''}</code>\n\n"
        f"📊 <b>취합 현황:</b> {approved_count}개 승인됨\n\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"✅ 이 댓글은 '실행 대기 큐'에 저장되었습니다.\n"
        f"✅ /execute 명령으로 일괄 실행 가능\n"
        f"━━━━━━━━━━━━━━━━━━━━━"
    )

    # 상태 변경
    update_pending_status_sb(comment_id, "approved", decided_by="telegram")


def execute_approved(chat_id: int):
    """승인된 댓글 일괄 실행 - Supabase에서 조회"""
    from src.storage.supabase_client import get_pending_comments_sb, update_pending_status_sb

    # Supabase에서 approved 상태 댓글 조회
    approved = get_pending_comments_sb("approved")
    
    if not approved:
        send_message(chat_id, "📭 승인된 댓글이 없습니다. 먼저 /pending 에서 승인하세요.")
        return
    
    count = len(approved)
    
    # 실행 시작 알림
    send_message(chat_id, f"🚀 <b>실행 시작!</b>\n\n총 {count}개의 댓글을 작성합니다...")
    
    # 실행 결과 추적
    success_count = 0
    failed_count = 0
    results = []
    
    for i, comment in enumerate(approved, 1):
        blog_id = comment['blog_id']
        comment_text = comment['comment_text']
        post_url = comment['post_url']
        
        # 실제 실행 (dry-run 모드로 테스트)
        try:
            # TODO: 실제 댓글 작성 로직 연동
            # from src.commenter.comment_writer import write_comment
            # success = write_comment(post_url, comment_text)
            
            # 현재는 테스트용으로 항상 성공 처리
            import random
            success = random.random() > 0.2  # 80% 성공률 시뮬레이션
            
            if success:
                update_pending_status_sb(comment['id'], "posted", decided_by="telegram")
                success_count += 1
                results.append(f"✅ {blog_id}: {comment_text[:20]}...")
            else:
                update_pending_status_sb(comment['id'], "failed", decided_by="telegram")
                failed_count += 1
                results.append(f"❌ {blog_id}: 실패 (재시도 큐에 추가)")
                
        except Exception as e:
            failed_count += 1
            results.append(f"❌ {blog_id}: 오류 - {str(e)[:30]}")
    
    # 결과 통보
    status_icon = "✅" if failed_count == 0 else "⚠️"
    send_message(
        chat_id,
        f"{status_icon} <b>실행 완료!</b>\n\n"
        f"📊 <b>결과:</b> 성공 {success_count}개 / 실패 {failed_count}개\n\n"
        f"<b>상세 내역:</b>\n" +
        "\n".join([f"{i+1}. {r}" for i, r in enumerate(results)]) +
        f"\n\n━━━━━━━━━━━━━━━━━━━━━"
    )
    
    # 메모리 큐도 초기화 (동기화)
    _approved_comments[chat_id] = []


def main():
    print("=" * 50)
    print("  텔레그램 봇 (간단 버전)")
    print("=" * 50)
    
    from src.storage.database import init_db
    init_db()
    print("✅ DB 초기화 완료\n")
    
    offset = 0
    
    while True:
        try:
            r = httpx.get(f"{BASE_URL}/getUpdates", params={"offset": offset, "timeout": 30}, timeout=35)
            updates = r.json().get("result", [])
            
            for update in updates:
                offset = update["update_id"] + 1
                
                # 백 처리
                if "callback_query" in update:
                    query = update["callback_query"]
                    chat_id = query["message"]["chat"]["id"]
                    data = query["data"]
                    query_id = query["id"]
                    
                    if ALLOWED_CHAT_ID and str(chat_id) != ALLOWED_CHAT_ID:
                        continue
                    
                    if data.startswith("approve:"):
                        comment_id = data.split(":", 1)[1]
                        handle_approval(chat_id, comment_id, "approve", query_id)
                    elif data.startswith("reject:"):
                        comment_id = data.split(":", 1)[1]
                        handle_approval(chat_id, comment_id, "reject", query_id)
                    continue
                
                # 메시지 처리
                message = update.get("message")
                if not message:
                    continue
                
                chat_id = message["chat"]["id"]
                
                if ALLOWED_CHAT_ID and str(chat_id) != ALLOWED_CHAT_ID:
                    send_message(chat_id, "권한이 없습니다.")
                    continue
                
                if "text" not in message:
                    continue
                
                text = message["text"].strip()
                
                if text == "/pending":
                    show_pending(chat_id)
                elif text == "/execute":
                    execute_approved(chat_id)
                elif text == "/help":
                    send_message(
                        chat_id,
                        "<b>📋 명령어</b>\n\n"
                        "/pending - 승인 대기 목록\n"
                        "/execute - 승인된 댓글 실행\n"
                        "/help - 도움말"
                    )
                else:
                    send_message(chat_id, "알 수 없는 명령어. /help 를 입력하세요.")
                    
        except KeyboardInterrupt:
            print("\n봇 종료.")
            break
        except Exception as e:
            print(f"오류: {e}")
            time.sleep(5)


if __name__ == "__main__":
    main()

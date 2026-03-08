#!/usr/bin/env python3
"""
디버깅용 텔레그램 봇
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv()

import httpx

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ALLOWED_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
BASE_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

print(f"Bot Token: {BOT_TOKEN[:20]}...")
print(f"Allowed Chat ID: {ALLOWED_CHAT_ID}")
print(f"Base URL: {BASE_URL[:50]}...")

# DB 초기화
from src.storage.database import init_db, get_pending_comments, update_pending_comment
init_db()

def send_message(chat_id: int, text: str):
    try:
        payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        r = httpx.post(f"{BASE_URL}/sendMessage", json=payload, timeout=10)
        print(f"Send message response: {r.status_code}")
        return r.json()
    except Exception as e:
        print(f"메시지 전송 실패: {e}")
        return None

def main():
    print("\n=== 디버깅 봇 시작 ===")
    print("명령어: /test, /pending, /approved, /approve_id <id>, /execute")
    
    offset = 0
    
    while True:
        try:
            print(f"\n[Polling] offset={offset}")
            r = httpx.get(f"{BASE_URL}/getUpdates", params={"offset": offset, "timeout": 30}, timeout=35)
            data = r.json()
            
            if not data.get("ok"):
                print(f"API Error: {data}")
                time.sleep(5)
                continue
            
            updates = data.get("result", [])
            print(f"Received {len(updates)} updates")
            
            for update in updates:
                print(f"\n--- Update ---")
                print(f"Raw: {update}")
                
                offset = update["update_id"] + 1
                
                # 콜백 처리 (버튼 클릭)
                if "callback_query" in update:
                    query = update["callback_query"]
                    chat_id = query["message"]["chat"]["id"]
                    data = query["data"]
                    query_id = query["id"]
                    
                    print(f"Callback: chat_id={chat_id}, data={data}, query_id={query_id}")
                    
                    if ALLOWED_CHAT_ID and str(chat_id) != ALLOWED_CHAT_ID:
                        print(f"Unauthorized chat_id: {chat_id}")
                        continue
                    
                    if data.startswith("approve:"):
                        comment_id = int(data.split(":")[1])
                        print(f"Approving comment_id={comment_id}")
                        
                        # DB 업데이트
                        try:
                            update_pending_comment(comment_id, "approved")
                            print(f"✅ DB updated: comment {comment_id} -> approved")
                            
                            # 확인
                            approved = get_pending_comments("approved")
                            print(f"Current approved count: {len(approved)}")
                            
                            send_message(chat_id, f"✅ 승인 완료! (ID: {comment_id})")
                        except Exception as e:
                            print(f"❌ DB update failed: {e}")
                            send_message(chat_id, f"❌ 오류: {e}")
                    
                    continue
                
                # 메시지 처리
                message = update.get("message")
                if not message:
                    continue
                
                chat_id = message["chat"]["id"]
                print(f"Message from chat_id={chat_id}")
                
                if ALLOWED_CHAT_ID and str(chat_id) != ALLOWED_CHAT_ID:
                    print(f"Unauthorized")
                    send_message(chat_id, "권한이 없습니다.")
                    continue
                
                if "text" not in message:
                    continue
                
                text = message["text"].strip()
                print(f"Command: {text}")
                
                if text == "/test":
                    send_message(chat_id, "✅ 봇이 작동합니다!")
                
                elif text == "/pending":
                    pending = get_pending_comments("pending")
                    send_message(chat_id, f"📋 대기 중: {len(pending)}개")
                    for p in pending:
                        send_message(chat_id, f"ID {p['id']}: {p['blog_id']}\n{p['comment_text'][:50]}...")
                
                elif text == "/approved":
                    approved = get_pending_comments("approved")
                    send_message(chat_id, f"✅ 승인됨: {len(approved)}개")
                    for a in approved:
                        send_message(chat_id, f"ID {a['id']}: {a['blog_id']}\n{a['comment_text'][:50]}...")
                
                elif text.startswith("/approve_id "):
                    try:
                        comment_id = int(text.split()[1])
                        update_pending_comment(comment_id, "approved")
                        send_message(chat_id, f"✅ ID {comment_id} 승인 완료")
                    except Exception as e:
                        send_message(chat_id, f"❌ 오류: {e}")
                
                elif text == "/execute":
                    approved = get_pending_comments("approved")
                    if not approved:
                        send_message(chat_id, "❌ 승인된 댓글이 없습니다")
                        continue
                    
                    send_message(chat_id, f"🚀 실행: {len(approved)}개")
                    for a in approved:
                        send_message(chat_id, f"- {a['blog_id']}: {a['comment_text'][:30]}...")
                
                elif text == "/help":
                    send_message(chat_id, "/test, /pending, /approved, /approve_id <id>, /execute")
                    
        except KeyboardInterrupt:
            print("\n봇 종료.")
            break
        except Exception as e:
            print(f"오류: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(5)

if __name__ == "__main__":
    main()

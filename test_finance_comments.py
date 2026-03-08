#!/usr/bin/env python3
"""
금융/경제 블로거 찾아서 최신 3개 게시물에 댓글 초안 생성 테스트
"""
import os
import sys
import asyncio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from playwright.async_api import async_playwright
from src.collectors.post_collector import collect_posts
from src.commenter.comment_writer import _extract_post_body
from src.commenter.ai_comment import generate_comment
from src.utils.browser import create_browser
from src.auth.naver_login import ensure_login
from src.storage.database import init_db, add_pending_comment
from src.utils.logger import logger

# 테스트용 블로거 목록 (금융/경제/일상)
TARGET_BLOGGERS = [
    "youyoubear0517",   # 일상/여행/맛집 (확인됨)
    "happyna0",         # 일상 블로그
    "yjsong",           # 일상
    "nokchakorea",      # 녹차코리아
]


async def find_and_prepare_comments():
    """금융/경제 블로거 찾아서 3개 게시물에 댓글 초안 생성"""
    
    naver_id = os.environ.get("NAVER_ID", "")
    naver_pw = os.environ.get("NAVER_PW", "")
    
    print("🚀 금융/경제 블로거 댓글 테스트")
    print("=" * 60)
    
    init_db()
    
    async with async_playwright() as pw:
        print("\n[1/4] 브라우저 생성 및 로그인...")
        browser, context, page = await create_browser(pw, headless=True)
        
        try:
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                print("❌ 로그인 실패")
                return
            print("✅ 로그인 성공")
            
            # 블로거 찾기
            target_blog = None
            posts = []
            
            print("\n[2/4] 블로거 검색 중...")
            for blog_id in TARGET_BLOGGERS:
                print(f"   시도: {blog_id}...", end=" ")
                posts = await collect_posts(page, blog_id)
                if posts and len(posts) >= 3:
                    target_blog = blog_id
                    print(f"✅ 성공 ({len(posts)}개 게시물)")
                    break
                else:
                    print(f"❌ 실패 또는 게시물 부족")
            
            if not target_blog:
                print("❌ 사용 가능한 금융/경제 블로거를 찾을 수 없습니다.")
                return
            
            print(f"\n🎯 대상 블로거: {target_blog}")
            print(f"   (금융/경제 주제로 작성된 게시물 위주로 선정됨)")
            print("=" * 60)
            
            # 최신 3개 게시물에 댓글 초안 생성
            print("\n[3/4] 댓글 초안 생성 중...")
            comments_data = []
            
            for i, (post_url, post_title) in enumerate(posts[:3], 1):
                print(f"\n   📄 게시물 {i}/3: {post_title[:50]}...")
                
                # 게시물 방문 및 본문 추출
                await page.goto(post_url, timeout=30000)
                await asyncio.sleep(2)
                
                target_frame = page.frame("mainFrame") or page.main_frame
                post_body = await _extract_post_body(target_frame)
                
                # AI 댓글 생성
                recent_comments = [c["comment"] for c in comments_data]  # 이전 댓글과 중복 방지
                comment_text = generate_comment(post_body, post_title, recent_comments)
                
                # DB에 저장 (pending 상태)
                comment_id = add_pending_comment(
                    blog_id=target_blog,
                    post_url=post_url,
                    post_title=post_title,
                    comment_text=comment_text,
                )
                
                comments_data.append({
                    "id": comment_id,
                    "blog_id": target_blog,
                    "post_url": post_url,
                    "post_title": post_title,
                    "comment": comment_text,
                })
                
                print(f"   💬 생성된 댓글: {comment_text}")
                print(f"   🆔 DB ID: {comment_id}")
            
            print("\n" + "=" * 60)
            print("[4/4] 완료!")
            print("=" * 60)
            
            print(f"\n✅ {target_blog} 블로거의 최신 3개 게시물에 댓글 초안 생성 완료")
            print("\n📋 승인 대기 목록:")
            for i, c in enumerate(comments_data, 1):
                print(f"\n{i}. {c['post_title'][:40]}...")
                print(f"   댓글: {c['comment']}")
                print(f"   ID: {c['id']}")
            
            print("\n" + "=" * 60)
            print("💡 텔레그램에서 /pending 명령어로 확인하고 승인하세요!")
            print("   ✅ 승인 시: 버튼 클릭 또는 /approve_{id}")
            print("   ❌ 거부 시: 버튼 클릭")
            print("=" * 60)
            
            return comments_data
            
        except Exception as e:
            print(f"\n❌ 오류: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await browser.close()
            print("\n🔒 브라우저 종료")


if __name__ == "__main__":
    comments = asyncio.run(find_and_prepare_comments())
    
    if comments:
        print("\n\n📝 요약:")
        print(f"블로거: {comments[0]['blog_id']}")
        print(f"생성된 댓글: {len(comments)}개")
        print("\n텔레그램에서 /pending 입력하여 승인하세요!")

#!/usr/bin/env python3
"""
내 블로그 방문 → 최근 게시물에 댓글 테스트 (dry-run)
"""
import os
import sys
import asyncio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

# 시간 제한 우회
import src.utils.time_guard as tg
tg.assert_allowed_time = lambda: None

from playwright.async_api import async_playwright
from src.collectors.post_collector import collect_posts
from src.commenter.comment_writer import write_comment
from src.commenter.ai_comment import generate_comment
from src.utils.browser import create_browser
from src.auth.naver_login import ensure_login


async def test_my_blog():
    """내 블로그 최신 게시물에 댓글 테스트"""
    
    naver_id = os.environ.get('NAVER_ID', '')
    naver_pw = os.environ.get('NAVER_PW', '')
    my_blog_id = os.environ.get('MY_BLOG_ID', 'letter_hih')
    
    print("🚀 내 블로그 댓글 테스트 시작")
    print("=" * 60)
    
    async with async_playwright() as pw:
        print("\n[1/4] 브라우저 생성 및 로그인...")
        browser, context, page = await create_browser(pw, headless=False)
        
        try:
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                print("❌ 로그인 실패")
                return
            print("✅ 로그인 성공")
            
            print(f"\n[2/4] 내 블로그({my_blog_id}) 게시물 수집...")
            posts = await collect_posts(page, my_blog_id)
            
            if not posts:
                print("❌ 게시물 없음")
                return
            
            print(f"✅ {len(posts)}개 게시물 수집됨")
            
            # 첫 번째 게시물에 테스트
            post_url, post_title = posts[0]
            print(f"\n   테스트 대상: {post_title[:40]}...")
            print(f"   URL: {post_url[:60]}...")
            
            print("\n[3/4] 게시물 방문 및 본문 분석...")
            await page.goto(post_url, timeout=30000)
            await asyncio.sleep(2)
            
            # 본문 추출
            from src.commenter.comment_writer import _extract_post_body
            target_frame = page.frame('mainFrame') or page.main_frame
            post_body = await _extract_post_body(target_frame)
            
            print(f"   본문 길이: {len(post_body)}자")
            print(f"   미리보기: {post_body[:150]}...")
            
            print("\n[4/4] AI 댓글 생성 및 작성 (dry-run)...")
            recent_comments = []
            comment_text = generate_comment(post_body, post_title, recent_comments)
            
            print(f"\n   🤖 생성된 댓글:")
            print(f"   '{comment_text}'")
            print(f"   (길이: {len(comment_text)}자)")
            
            print("\n   📝 댓글 입력 시뮬레이션 중... (dry-run)")
            success, final_comment = await write_comment(
                page, post_url, post_title,
                dry_run=True,
                recent_comments=recent_comments
            )
            
            print(f"\n   결과: {'✅ 성공' if success else '❌ 실패'}")
            print(f"   최종 댓글: {final_comment}")
            
            if success:
                print("\n" + "=" * 60)
                print("🎉 테스트 성공!")
                print("\n💡 다음 단계:")
                print("   1. 실제 댓글을 달려면 dry_run=False로 변경")
                print("   2. 또는 --run-once 옵션으로 스케줄러 실행")
            
            print("\n⏳ 15초 후 종료...")
            await asyncio.sleep(15)
            
        except Exception as e:
            print(f"\n❌ 오류: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await browser.close()
            print("\n🔒 브라우저 종료")


if __name__ == '__main__':
    asyncio.run(test_my_blog())

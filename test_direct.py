#!/usr/bin/env python3
"""
직접 URL 입력받아 댓글 테스트
사용법: python test_direct.py <blog_id> <log_no>
예시: python test_direct.py happyna0 223123456789
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
from src.commenter.comment_writer import write_comment
from src.utils.browser import create_browser
from src.auth.naver_login import ensure_login


async def test_direct(blog_id: str, log_no: str):
    """직접 지정한 게시물에 댓글 테스트"""
    
    naver_id = os.environ.get('NAVER_ID', '')
    naver_pw = os.environ.get('NAVER_PW', '')
    
    post_url = f'https://blog.naver.com/{blog_id}/{log_no}'
    
    print("🚀 직접 지정 댓글 테스트")
    print("=" * 60)
    print(f"대상: {blog_id}/{log_no}")
    print(f"URL: {post_url}")
    print("=" * 60)
    
    async with async_playwright() as pw:
        print("\n[1/3] 브라우저 생성 및 로그인...")
        browser, context, page = await create_browser(pw, headless=False)
        
        try:
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                print("❌ 로그인 실패")
                return
            print("✅ 로그인 성공")
            
            print(f"\n[2/3] 게시물 방문: {blog_id}/{log_no}...")
            await page.goto(post_url, timeout=30000)
            await page.wait_for_load_state('domcontentloaded', timeout=30000)
            await asyncio.sleep(3)
            
            # 제목 가져오기
            post_title = await page.title()
            print(f"   제목: {post_title[:50]}...")
            
            # 본문 추출
            from src.commenter.comment_writer import _extract_post_body
            target_frame = page.frame('mainFrame') or page.main_frame
            post_body = await _extract_post_body(target_frame)
            print(f"   본문: {len(post_body)}자")
            
            if len(post_body) < 10:
                print("   ⚠️ 본문이 너무 짧거나 로드 실패")
                print(f"   페이지 내용 확인: {await page.content()[:500]}...")
            
            print("\n[3/3] AI 댓글 생성 및 작성 (dry-run)...")
            from src.commenter.ai_comment import generate_comment
            recent_comments = []
            comment_text = generate_comment(post_body, post_title, recent_comments)
            
            print(f"\n   🤖 생성된 댓글: '{comment_text}'")
            
            success, final_comment = await write_comment(
                page, post_url, post_title,
                dry_run=True,
                recent_comments=recent_comments
            )
            
            print(f"\n   결과: {'✅ 성공' if success else '❌ 실패'}")
            
            if success:
                print("\n" + "=" * 60)
                print("🎉 테스트 성공!")
                print("\n💡 실제 댓글을 달려면 main.py --run-once 실행")
            
            print("\n⏳ 30초 후 종료...")
            await asyncio.sleep(30)
            
        except Exception as e:
            print(f"\n❌ 오류: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await browser.close()
            print("\n🔒 브라우저 종료")


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("사용법: python test_direct.py <blog_id> <log_no>")
        print("예시: python test_direct.py happyna0 223123456789")
        print("\n참고: log_no는 게시물 URL 끝 숫자입니다.")
        print("  예) https://blog.naver.com/happyna0/223123456789")
        sys.exit(1)
    
    blog_id = sys.argv[1]
    log_no = sys.argv[2]
    
    asyncio.run(test_direct(blog_id, log_no))

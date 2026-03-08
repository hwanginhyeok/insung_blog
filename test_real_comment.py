#!/usr/bin/env python3
"""
실제 블로그 댓글 작성 테스트 (dry-run)
- 시간 제한 우회
- 실제 네이버 블로그 방문
- 댓글 입력까지 시뮬레이션 (제출은 안 함)
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
from src.commenter.ai_comment import generate_comment
from src.utils.browser import create_browser
from src.auth.naver_login import ensure_login
from src.utils.logger import logger


async def test_real_blog():
    """실제 블로그에 방문해서 댓글 작성 테스트 (dry-run)"""
    
    naver_id = os.environ.get('NAVER_ID', '')
    naver_pw = os.environ.get('NAVER_PW', '')
    
    print("🚀 실제 블로그 댓글 작성 테스트 시작")
    print("=" * 60)
    
    async with async_playwright() as pw:
        # 브라우저 생성
        print("\n[1/5] 브라우저 생성 중...")
        browser, context, page = await create_browser(pw, headless=False)  # 창 띄워서 보기
        
        try:
            # 로그인
            print("[2/5] 네이버 로그인 중...")
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                print("❌ 로그인 실패")
                return
            print("✅ 로그인 성공")
            
            # 테스트할 블로그와 게시물
            # 네이버 블로그 메인에서 인기 블로그나 테스트 가능한 블로그 찾기
            # 또는 직접 URL 지정
            
            print("\n[3/5] 블로그 게시물 검색 중...")
            
            # 방법 1: 네이버 블로그 메인에서 게시물 찾기
            await page.goto('https://blog.naver.com', timeout=30000)
            await asyncio.sleep(2)
            
            # 메인에서 첫 번째 게시물 링크 찾기
            post_links = await page.query_selector_all('a[href*="blog.naver.com"]')
            test_url = None
            
            for link in post_links[:10]:
                href = await link.get_attribute('href')
                if href and '/PostView.naver' in href:
                    test_url = href
                    print(f"   찾은 게시물: {href[:60]}...")
                    break
            
            if not test_url:
                # 방법 2: 직접 URL 사용
                # 테스트용 공개 블로그 (변경 가능)
                test_url = 'https://blog.naver.com/nokchakorea/223668613952'
                print(f"   기본 URL 사용: {test_url}")
            
            print("\n[4/5] AI 댓글 생성 중...")
            # 먼저 본문 추출을 위해 페이지 방문
            await page.goto(test_url, timeout=30000)
            await page.wait_for_load_state('domcontentloaded', timeout=30000)
            await asyncio.sleep(3)
            
            # mainFrame에서 본문 추출
            from src.commenter.comment_writer import _extract_post_body
            target_frame = page.frame('mainFrame') or page.main_frame
            post_body = await _extract_post_body(target_frame)
            post_title = await page.title()
            
            print(f"   게시물 제목: {post_title[:40]}...")
            print(f"   본문 길이: {len(post_body)}자")
            print(f"   본문 미리보기: {post_body[:100]}...")
            
            # AI 댓글 생성
            recent_comments = []  # 실제로는 DB에서 조회
            comment_text = generate_comment(post_body, post_title, recent_comments)
            
            print(f"\n   생성된 댓글: {comment_text}")
            
            print("\n[5/5] 댓글 작성 시뮬레이션 (dry-run)...")
            success, final_comment = await write_comment(
                page, test_url, post_title, 
                dry_run=True,  # 실제 제출 안 함!
                recent_comments=recent_comments
            )
            
            print(f"\n   결과: {'성공' if success else '실패'}")
            print(f"   최종 댓글: {final_comment}")
            
            print("\n" + "=" * 60)
            print("✅ 테스트 완료!")
            print("\n💡 실제 제출하려면:")
            print("   write_comment()의 dry_run=False로 변경")
            
            # 10초 대기 (화면 확인용)
            print("\n⏳ 10초 후 종료... (화면 확인)")
            await asyncio.sleep(10)
            
        except Exception as e:
            print(f"\n❌ 오류 발생: {e}")
            import traceback
            traceback.print_exc()
            
        finally:
            await browser.close()
            print("\n🔒 브라우저 종료")


if __name__ == '__main__':
    asyncio.run(test_real_blog())

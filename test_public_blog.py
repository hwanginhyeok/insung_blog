#!/usr/bin/env python3
"""
네이버 블로그 메인에서 공개 게시물 찾아 댓글 테스트
"""
import os
import sys
import asyncio
import re

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


async def find_and_test():
    """네이버 블로그 메인에서 게시물 찾아 테스트"""
    
    naver_id = os.environ.get('NAVER_ID', '')
    naver_pw = os.environ.get('NAVER_PW', '')
    
    print("🚀 공개 블로그 댓글 테스트 시작")
    print("=" * 60)
    
    async with async_playwright() as pw:
        print("\n[1/5] 브라우저 생성 및 로그인...")
        browser, context, page = await create_browser(pw, headless=False)
        
        try:
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                print("❌ 로그인 실패")
                return
            print("✅ 로그인 성공")
            
            print("\n[2/5] 네이버 블로그 메인에서 게시물 검색...")
            await page.goto('https://section.blog.naver.com/ThemePost.naver', timeout=30000)
            await asyncio.sleep(3)
            
            # 게시물 링크 찾기
            print("   게시물 링크 검색 중...")
            
            # 여러 셀렉터 시도
            selectors = [
                '.info_post a[href*="blog.naver.com"]',
                '.list_article .title a',
                'a[href*="PostView.naver"]',
                '.post_list a'
            ]
            
            post_url = None
            post_title = "테스트 게시물"
            
            for selector in selectors:
                links = await page.query_selector_all(selector)
                for link in links[:5]:
                    href = await link.get_attribute('href')
                    if href and 'blog.naver.com' in href:
                        # blogId와 logNo 추출
                        match = re.search(r'blogId=([^&]+)&logNo=(\d+)', href)
                        if match:
                            blog_id = match.group(1)
                            log_no = match.group(2)
                            post_url = f'https://blog.naver.com/{blog_id}/{log_no}'
                            title = await link.inner_text()
                            post_title = title.strip()[:50] if title else "테스트 게시물"
                            print(f"   ✓ 게시물 찾음: {blog_id}/{log_no}")
                            break
                if post_url:
                    break
            
            if not post_url:
                print("   블로그 메인에서 못 찾음, 키워드 검색 시도...")
                # 맛집 키워드로 검색
                await page.goto('https://section.blog.naver.com/Search/Post.naver?pageNo=1&rangeType=ALL&orderBy=sim&keyword=맛집', timeout=30000)
                await asyncio.sleep(3)
                
                links = await page.query_selector_all('.info_post a.title')
                for link in links[:3]:
                    href = await link.get_attribute('href')
                    if href:
                        post_url = href
                        title = await link.inner_text()
                        post_title = title.strip()[:50] if title else "맛집 후기"
                        print(f"   ✓ 검색으로 찾음: {post_title}")
                        break
            
            if not post_url:
                print("❌ 테스트할 게시물을 찾을 수 없음")
                return
            
            print(f"\n   테스트 대상: {post_title}")
            print(f"   URL: {post_url}")
            
            print("\n[3/5] 게시물 방문 및 본문 추출...")
            await page.goto(post_url, timeout=30000)
            await page.wait_for_load_state('domcontentloaded', timeout=30000)
            await asyncio.sleep(3)
            
            from src.commenter.comment_writer import _extract_post_body
            target_frame = page.frame('mainFrame') or page.main_frame
            post_body = await _extract_post_body(target_frame)
            
            print(f"   ✅ 본문 추출 완료: {len(post_body)}자")
            if len(post_body) > 0:
                print(f"   미리보기: {post_body[:200].replace(chr(10), ' ')}...")
            
            print("\n[4/5] AI 댓글 생성...")
            recent_comments = []
            comment_text = generate_comment(post_body, post_title, recent_comments)
            
            print(f"\n   🤖 생성된 댓글:")
            print(f"   '{comment_text}'")
            
            print("\n[5/5] 댓글 작성 (dry-run)...")
            success, final_comment = await write_comment(
                page, post_url, post_title,
                dry_run=True,
                recent_comments=recent_comments
            )
            
            print(f"\n   결과: {'✅ 성공' if success else '❌ 실패'}")
            print(f"   최종 댓글: {final_comment[:100]}...")
            
            if success:
                print("\n" + "=" * 60)
                print("🎉 실제 블로그 댓글 테스트 성공!")
                print("\n✅ 확인된 사항:")
                print("   - 로그인 정상")
                print("   - 게시물 접근 정상")
                print("   - 본문 추출 정상")
                print("   - AI 댓글 생성 정상")
                print("   - 댓글 입력 시뮬레이션 정상")
            
            print("\n⏳ 20초 후 종료 (화면 확인)...")
            await asyncio.sleep(20)
            
        except Exception as e:
            print(f"\n❌ 오류: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await browser.close()
            print("\n🔒 브라우저 종료")


if __name__ == '__main__':
    asyncio.run(find_and_test())

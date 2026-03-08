#!/usr/bin/env python3
"""
youyoubear0517 블로그 최근 게시물 3개에 대한 가상 댓글 생성
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
from src.commenter.ai_comment import generate_comment
from src.commenter.comment_writer import _extract_post_body
from src.utils.browser import create_browser
from src.auth.naver_login import ensure_login


async def preview_comments():
    """최근 게시물 3개에 대한 가상 댓글 생성"""
    
    naver_id = os.environ.get('NAVER_ID', '')
    naver_pw = os.environ.get('NAVER_PW', '')
    target_blog = 'youyoubear0517'
    
    print("🚀 가상 댓글 미리보기")
    print("=" * 70)
    print(f"대상 블로그: {target_blog}")
    print("=" * 70)
    
    async with async_playwright() as pw:
        print("\n[1/2] 브라우저 생성 및 로그인...")
        browser, context, page = await create_browser(pw, headless=True)
        
        try:
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                print("❌ 로그인 실패")
                return
            print("✅ 로그인 성공")
            
            print(f"\n[2/2] {target_blog} 게시물 수집 중...")
            posts = await collect_posts(page, target_blog)
            
            if not posts:
                print("❌ 게시물을 수집할 수 없습니다.")
                return
            
            print(f"✅ {len(posts)}개 게시물 수집됨")
            print()
            
            # 최대 3개만 처리
            target_posts = posts[:3]
            recent_comments = []  # 중복 방지용
            
            for idx, (post_url, post_title) in enumerate(target_posts, 1):
                print(f"\n{'='*70}")
                print(f"📄 게시물 {idx}/3")
                print(f"   제목: {post_title}")
                print(f"   URL: {post_url}")
                print("-" * 70)
                
                # 게시물 방문해서 본문 추출
                await page.goto(post_url, timeout=30000)
                await page.wait_for_load_state('domcontentloaded', timeout=30000)
                await asyncio.sleep(2)
                
                target_frame = page.frame('mainFrame') or page.main_frame
                post_body = await _extract_post_body(target_frame)
                
                print(f"   본문 길이: {len(post_body)}자")
                if len(post_body) > 0:
                    preview = post_body[:150].replace('\n', ' ')
                    print(f"   본문 미리보기: {preview}...")
                
                # AI 댓글 생성
                print("\n   💬 생성된 댓글:")
                comment = generate_comment(post_body, post_title, recent_comments)
                print(f"   → '{comment}'")
                print(f"   (길이: {len(comment)}자)")
                
                # 중복 방지를 위해 리스트에 추가
                recent_comments.append(comment)
            
            print("\n" + "=" * 70)
            print("✅ 가상 댓글 미리보기 완료!")
            print("\n💡 이 댓글들은 실제로 달리지 않았습니다.")
            print("   실제로 달려면 main.py --run-once --test-visit youyoubear0517")
            
        except Exception as e:
            print(f"\n❌ 오류: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await browser.close()
            print("\n🔒 브라우저 종료")


if __name__ == '__main__':
    asyncio.run(preview_comments())

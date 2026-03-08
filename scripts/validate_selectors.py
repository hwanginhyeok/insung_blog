#!/usr/bin/env python3
"""
네이버 블로그 스마트에디터 셀렉터 유효성 검증 스크립트
- 주요 셀렉터가 실제로 존재하는지 확인
- 실패 시 보고서 출력
"""
import os
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from playwright.async_api import async_playwright
from src.utils.browser import create_browser
from src.auth.naver_login import ensure_login
from src.utils.logger import logger


# 검증할 셀렉터 목록 (blog_publisher.py 기준)
SELECTORS_TO_VALIDATE = {
    "title": [
        ".se-title-text .se-text-paragraph",
        ".se-title-text",
        "[placeholder*='제목']",
    ],
    "body": [
        ".se-text-paragraph",
        "[contenteditable='true']",
        ".se-component-content",
    ],
    "image_button": [
        "button[data-name='image']",
        ".se-toolbar-item-image button",
        ".se-image-tool-button",
    ],
    "tag_input": [
        "[placeholder*='태그']",
        "[class*='tag_textarea']",
        "[class*='tag_input']",
    ],
    "publish_button": [
        'button[data-click-area="tpb.publish"]',
    ],
}


async def validate_selectors():
    """셀렉터 유효성 검증"""
    naver_id = os.environ.get("NAVER_ID", "")
    naver_pw = os.environ.get("NAVER_PW", "")
    my_blog_id = os.environ.get("MY_BLOG_ID", "letter_hih")
    
    print("🔍 스마트에디터 셀렉터 유효성 검증")
    print("=" * 60)
    
    results = {}
    
    async with async_playwright() as pw:
        print("\n[1/3] 브라우저 생성 및 로그인...")
        browser, context, page = await create_browser(pw, headless=True)
        
        try:
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                print("❌ 로그인 실패")
                return
            print("✅ 로그인 성공")
            
            print(f"\n[2/3] 글쓰기 페이지 로드...")
            write_url = f"https://blog.naver.com/{my_blog_id}/postwrite"
            await page.goto(write_url, timeout=30000)
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(3)
            
            print("✅ 페이지 로드 완료")
            
            print("\n[3/3] 셀렉터 검증 중...")
            print("-" * 60)
            
            for category, selectors in SELECTORS_TO_VALIDATE.items():
                print(f"\n📌 {category.upper()}")
                results[category] = []
                
                for selector in selectors:
                    try:
                        # 5초 타임아웃으로 요소 찾기
                        element = await page.wait_for_selector(selector, timeout=5000)
                        if element:
                            count = await page.locator(selector).count()
                            results[category].append({
                                "selector": selector,
                                "found": True,
                                "count": count
                            })
                            print(f"   ✅ {selector[:50]:<50} (개수: {count})")
                    except Exception as e:
                        results[category].append({
                            "selector": selector,
                            "found": False,
                            "error": str(e)
                        })
                        print(f"   ❌ {selector[:50]:<50}")
            
            # 결과 요약
            print("\n" + "=" * 60)
            print("📊 검증 결과 요약")
            print("=" * 60)
            
            total_selectors = sum(len(s) for s in SELECTORS_TO_VALIDATE.values())
            found_selectors = sum(
                sum(1 for r in results[cat] if r["found"]) 
                for cat in results
            )
            
            print(f"총 셀렉터: {total_selectors}개")
            print(f"성공: {found_selectors}개")
            print(f"실패: {total_selectors - found_selectors}개")
            
            # 카테고리별 성공률
            print("\n카테고리별 성공률:")
            for category, result_list in results.items():
                success = sum(1 for r in result_list if r["found"])
                total = len(result_list)
                rate = (success / total * 100) if total > 0 else 0
                status = "✅" if rate >= 50 else "⚠️"
                print(f"   {status} {category}: {success}/{total} ({rate:.0f}%)")
            
            # 경고
            failed_categories = [
                cat for cat, result_list in results.items()
                if not any(r["found"] for r in result_list)
            ]
            
            if failed_categories:
                print("\n🚨 주의: 다음 카테고리의 모든 셀렉터가 실패했습니다!")
                for cat in failed_categories:
                    print(f"   - {cat}")
                print("\n💡 blog_publisher.py의 SELECTOR들을 업데이트해야 합니다.")
            else:
                print("\n✅ 모든 카테고리에서 최소 1개의 셀렉터가 작동합니다.")
            
        except Exception as e:
            print(f"\n❌ 검증 중 오류: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await browser.close()
            print("\n🔒 브라우저 종료")


if __name__ == "__main__":
    asyncio.run(validate_selectors())

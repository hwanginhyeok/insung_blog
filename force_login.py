#!/usr/bin/env python3
"""
강제 재로그인 스크립트 - ID/PW로 로그인 후 쿠키 저장
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, '.')

from playwright.async_api import async_playwright
from src.utils.browser import create_browser

async def force_login():
    print("=== 강제 재로그인 ===")
    
    naver_id = os.environ.get("NAVER_ID", "")
    naver_pw = os.environ.get("NAVER_PW", "")
    
    if not naver_id or not naver_pw:
        print("❌ .env에 NAVER_ID, NAVER_PW 설정 필요")
        return
    
    async with async_playwright() as pw:
        browser, context, page = await create_browser(pw, headless=False)
        
        try:
            # 1. 네이버 로그인 페이지로 이동
            print("1. 네이버 로그인 페이지 이동...")
            await page.goto("https://nid.naver.com/nidlogin.login", timeout=30000)
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(2)
            
            # 2. ID 입력
            print("2. ID 입력...")
            await page.fill("#id", naver_id)
            print("   ✓ ID 입력 완료")
            await asyncio.sleep(1)
            
            # 3. PW 입력
            print("3. PW 입력...")
            await page.fill("#pw", naver_pw)
            print("   ✓ PW 입력 완료")
            await asyncio.sleep(1)
            
            # 4. 로그인 버튼 클릭
            print("4. 로그인 버튼 클릭...")
            await page.click(".btn_login")
            print("   ✓ 클릭 완료")
            
            # 5. 결과 대기
            print("5. 로그인 결과 대기 (10초)...")
            await asyncio.sleep(10)
            
            # 6. 현재 URL 확인
            current_url = page.url
            print(f"   현재 URL: {current_url}")
            
            # 7. QR 코드 확인
            qr_exists = await page.query_selector(".qr_code, #qr_code, img[alt*='QR']")
            if qr_exists:
                print("   ⚠️ QR 코드 인증 필요! 휴폰에서 QR 코드를 스캔하세요.")
                print("   60초 대기... (스캔 후 자동 진행)")
                await asyncio.sleep(60)
            
            # 8. 로그인 성공 확인
            current_url = page.url
            if "nid.naver.com" not in current_url and "login" not in current_url:
                print("   ✓ 로그인 성공!")
                
                # 9. 쿠키 저장
                print("9. 쿠키 저장...")
                os.makedirs("cookies", exist_ok=True)
                cookies = await context.cookies()
                with open("cookies/naver_cookies.json", "w") as f:
                    json.dump(cookies, f)
                print(f"   ✓ 쿠키 저장 완료: {len(cookies)}개")
                
                # 10. 네이버 블로그 접속 테스트
                print("10. 블로그 접속 테스트...")
                await page.goto("https://blog.naver.com/" + os.environ.get("MY_BLOG_ID", "letter_hih"))
                await asyncio.sleep(3)
                
                # 프로필 확인
                profile = await page.query_selector(".blog_profile_name, .user_name")
                if profile:
                    name = await profile.inner_text()
                    print(f"   ✓ 블로그 접속 성공: {name}")
                else:
                    print("   ⚠️ 프로필 확인 실패")
                    
            else:
                print("   ✗ 로그인 실패 - 추가 인증 필요")
                await page.screenshot(path="debug_login_failed.png")
                print("   스크린샷 저장: debug_login_failed.png")
                
        except Exception as e:
            print(f"❌ 오류: {e}")
            import traceback
            traceback.print_exc()
            
        finally:
            print("\n엔터를 누륩면 브라우저가 종료됩니다...")
            input()
            await browser.close()

if __name__ == "__main__":
    asyncio.run(force_login())

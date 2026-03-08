#!/usr/bin/env python3
"""
댓글 작성 디버그 스크립트 - 실제로 뭐가 일어나는지 확인
"""
import asyncio
import os
import sys

sys.path.insert(0, '.')

from dotenv import load_dotenv
load_dotenv()

from playwright.async_api import async_playwright
from src.auth.naver_login import ensure_login
from src.utils.browser import create_browser

# 테스트할 게시물 URL
TEST_URL = "https://blog.naver.com/ojh919/224202318183"
TEST_COMMENT = "테스트 댓글입니다 - 디버그"

async def debug_comment():
    print("=== 댓글 작성 디버그 시작 ===")
    print(f"URL: {TEST_URL}")
    print(f"댓글: {TEST_COMMENT}")
    print()
    
    naver_id = os.environ.get("NAVER_ID", "")
    naver_pw = os.environ.get("NAVER_PW", "")
    
    async with async_playwright() as pw:
        browser, context, page = await create_browser(pw, headless=False)  # 화면 보기
        
        try:
            # 로그인
            print("1. 로그인 시도...")
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                print("❌ 로그인 실패")
                return
            print("✓ 로그인 성공")
            print()
            
            # 게시물 이동
            print(f"2. 게시물 이동: {TEST_URL}")
            await page.goto(TEST_URL, timeout=30000)
            await page.wait_for_load_state("domcontentloaded", timeout=30000)
            await asyncio.sleep(3)
            print("✓ 페이지 로드 완료")
            print()
            
            # mainFrame 확인
            frame = page.frame("mainFrame") or page
            print(f"Frame: {frame}")
            
            # 댓글 영역 열기
            print("3. 댓글 영역 열기...")
            comment_opened = await frame.evaluate("""() => {
                const btn = document.querySelector('.btn_comment');
                if (btn) {
                    btn.click();
                    return true;
                }
                return false;
            }""")
            print(f"   댓글 열기 버튼 클릭: {comment_opened}")
            await asyncio.sleep(3)
            
            # 댓글 입력창 찾기
            print("4. 댓글 입력창 찾기...")
            input_selectors = [
                ".u_cbox_text",
                "div.u_cbox_text_mention", 
                ".u_cbox_write_wrap textarea",
                ".u_cbox_write textarea",
            ]
            
            input_el = None
            for selector in input_selectors:
                try:
                    input_el = await frame.wait_for_selector(selector, timeout=5000)
                    if input_el:
                        print(f"   ✓ 입력창 발견: {selector}")
                        break
                except:
                    print(f"   ✗ 입력창 없음: {selector}")
            
            if not input_el:
                print("❌ 댓글 입력창을 찾을 수 없음")
                # 스크린샷
                await page.screenshot(path="debug_no_input.png")
                print("   스크린샷 저장: debug_no_input.png")
                return
            
            # 댓글 입력
            print("5. 댓글 입력...")
            await input_el.evaluate("e => { e.scrollIntoView({block: 'center'}); e.click(); e.focus(); }")
            await asyncio.sleep(1)
            await page.keyboard.type(TEST_COMMENT, delay=50)
            print(f"   ✓ 입력 완료: {TEST_COMMENT}")
            
            # 입력 후 상태 확인
            current_text = await input_el.evaluate("e => e.textContent || e.value || ''")
            print(f"   현재 입력값: '{current_text}'")
            
            # 등록 버튼 찾기
            print("6. 등록 버튼 찾기...")
            
            # 모든 버튼 검색
            print("   모든 버튼 검색 중...")
            all_buttons = await frame.query_selector_all('button')
            print(f"   총 버튼 수: {len(all_buttons)}")
            
            for i, btn in enumerate(all_buttons):
                try:
                    text = await btn.inner_text()
                    is_visible = await btn.is_visible()
                    is_enabled = await btn.is_enabled()
                    if '등록' in text or 'upload' in text.lower():
                        print(f"   버튼 {i}: '{text}' (visible={is_visible}, enabled={is_enabled})")
                except:
                    pass
            
            submit_selectors = [
                ".u_cbox_btn_upload",
                "button.u_cbox_btn_upload",
                ".u_cbox_write_wrap button[type='submit']",
                ".btn_comment_write",
            ]
            
            submit_btn = None
            for selector in submit_selectors:
                try:
                    btn = await frame.query_selector(selector)
                    if btn:
                        is_visible = await btn.is_visible()
                        is_enabled = await btn.is_enabled()
                        print(f"   Selector {selector}: visible={is_visible}, enabled={is_enabled}")
                        if is_visible and is_enabled:
                            submit_btn = btn
                            print(f"   ✓ 등록 버튼 선택: {selector}")
                            break
                except Exception as e:
                    print(f"   ✗ 버튼 없음: {selector} - {e}")
            
            if not submit_btn:
                print("❌ 등록 버튼을 찾을 수 없음")
                await page.screenshot(path="debug_no_submit.png")
                return
            
            # 등록 버튼 클릭
            print("7. 등록 버튼 클릭...")
            await submit_btn.evaluate("e => { e.scrollIntoView({block: 'center'}); e.click(); }")
            print("   ✓ 버튼 클릭 완료")
            
            # 클릭 후 대기 및 상태 확인
            print("8. 결과 확인 (5초 대기)...")
            await asyncio.sleep(5)
            
            # 입력창이 비워졌는지 확인
            after_text = await input_el.evaluate("e => e.textContent || e.value || ''")
            print(f"   입력창 상태: '{after_text}'")
            
            if not after_text or len(after_text.strip()) == 0:
                print("   ✓ 입력창이 비워짐 (제출 성공 가능성)")
            else:
                print("   ✗ 입력창이 여전히 내용 있음 (제출 실패)")
            
            # 성공 메시지 확인
            print("9. 성공 메시지 확인...")
            try:
                notice = await frame.query_selector('.u_cbox_notice, .u_cbox_write_success, .u_cbox_alert')
                if notice:
                    notice_text = await notice.inner_text()
                    print(f"   알림 메시지: '{notice_text}'")
                else:
                    print("   알림 메시지 없음")
            except Exception as e:
                print(f"   알림 확인 오류: {e}")
            
            # 스크린샷
            await page.screenshot(path="debug_after_submit.png")
            print("   스크린샷 저장: debug_after_submit.png")
            
            # 페이지 새로고침 후 댓글 확인
            print("10. 페이지 새로고침 후 댓글 확인...")
            await page.reload()
            await asyncio.sleep(3)
            
            # 내 댓글이 있는지 확인
            page_content = await page.content()
            if TEST_COMMENT in page_content:
                print("   ✓ 페이지에서 내 댓글 발견!")
            else:
                print("   ✗ 페이지에서 내 댓글 없음")
            
            await page.screenshot(path="debug_final.png")
            print("   스크린샷 저장: debug_final.png")
            
            print()
            print("=== 디버그 완료 ===")
            print("스크린샷 3개 확인:")
            print("  - debug_no_input.png (입력창 없을 때)")
            print("  - debug_after_submit.png (제출 직후)")
            print("  - debug_final.png (최종)")
            
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(debug_comment())

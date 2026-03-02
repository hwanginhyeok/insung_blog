"""
네이버 로그인 모듈
1. 쿠키 파일 존재 → 쿠키 복원 → 로그인 상태 검증
2. 쿠키 없거나 만료 → ID/PW 직접 로그인 → 쿠키 저장
"""
import json
import time

from playwright.async_api import BrowserContext, Page, async_playwright

from config.settings import (
    COOKIES_PATH,
    ELEMENT_TIMEOUT,
    MAX_LOGIN_RETRIES,
    NAVER_LOGIN_URL,
    PAGE_LOAD_TIMEOUT,
)
from src.utils.logger import logger


async def _is_logged_in(page: Page) -> bool:
    """현재 페이지가 네이버 로그인 상태인지 확인"""
    await page.goto("https://www.naver.com", timeout=PAGE_LOAD_TIMEOUT)
    await page.wait_for_load_state("domcontentloaded", timeout=PAGE_LOAD_TIMEOUT)
    try:
        # 방법 1: 로그아웃 버튼 셀렉터
        el = await page.query_selector(
            ".MyView-module__btn_logout___gE2Uf, #gnb_logout, .link_logout, "
            "a[href*='nidlogin.logout'], [class*='btn_logout']"
        )
        if el:
            return True
        # 방법 2: 페이지 텍스트에 "로그아웃" 포함 여부
        content = await page.content()
        if "로그아웃" in content:
            return True
        return False
    except Exception:
        return False


async def _save_cookies(context: BrowserContext) -> None:
    """현재 세션 쿠키를 파일로 저장"""
    COOKIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    cookies = await context.cookies()
    with open(COOKIES_PATH, "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)
    logger.info(f"쿠키 저장 완료: {COOKIES_PATH}")


async def _load_cookies(context: BrowserContext) -> bool:
    """저장된 쿠키 파일을 컨텍스트에 적용. 파일 없으면 False 반환"""
    if not COOKIES_PATH.exists():
        return False
    with open(COOKIES_PATH, encoding="utf-8") as f:
        cookies = json.load(f)
    await context.add_cookies(cookies)
    logger.info("쿠키 복원 완료")
    return True


async def _do_login(page: Page, naver_id: str, naver_pw: str) -> bool:
    """ID/PW로 직접 로그인 시도. 성공 여부 반환"""
    import asyncio
    await page.goto(NAVER_LOGIN_URL, timeout=PAGE_LOAD_TIMEOUT)
    await page.wait_for_selector("#id", timeout=ELEMENT_TIMEOUT)
    await asyncio.sleep(1)

    # fill() 대신 press_sequentially()로 실제 키 이벤트 발생
    id_field = page.locator("#id")
    await id_field.click()
    await asyncio.sleep(0.3)
    await id_field.press_sequentially(naver_id, delay=80)
    await asyncio.sleep(0.5)

    pw_field = page.locator("#pw")
    await pw_field.click()
    await asyncio.sleep(0.3)
    await pw_field.press_sequentially(naver_pw, delay=80)
    await asyncio.sleep(0.5)

    await page.click(".btn_login")

    # 로그인 결과 대기 (성공 or 에러 메시지)
    try:
        await page.wait_for_url("https://www.naver.com/**", timeout=12_000)
        logger.info("로그인 성공")
        return True
    except Exception:
        # 현재 URL + 에러 메시지 기록
        current_url = page.url
        error_text = ""
        try:
            # 실제 로그인 오류 셀렉터 (Caps Lock 경고 제외)
            error_el = await page.query_selector(
                "#err_common:not(.capslock_wrap), .error_message"
            )
            if error_el:
                error_text = (await error_el.inner_text()).strip()
        except Exception:
            pass
        logger.warning(f"로그인 실패 (url={current_url}): {error_text or '리다이렉트 없음'}")
        return False


async def ensure_login(
    context: BrowserContext,
    page: Page,
    naver_id: str,
    naver_pw: str,
) -> bool:
    """
    로그인 상태를 보장하는 메인 함수.
    - 쿠키로 복원 시도 → 유효하면 바로 반환
    - 쿠키 만료 or 없으면 ID/PW 로그인 → 최대 MAX_LOGIN_RETRIES회 시도
    """
    # 1. 쿠키로 먼저 시도
    cookie_loaded = await _load_cookies(context)
    if cookie_loaded:
        if await _is_logged_in(page):
            logger.info("쿠키로 로그인 상태 확인됨")
            return True
        logger.info("쿠키 만료 — ID/PW 로그인으로 전환")
        COOKIES_PATH.unlink(missing_ok=True)

    # 2. ID/PW 로그인 재시도
    for attempt in range(1, MAX_LOGIN_RETRIES + 1):
        logger.info(f"로그인 시도 {attempt}/{MAX_LOGIN_RETRIES}")
        success = await _do_login(page, naver_id, naver_pw)
        if success:
            await _save_cookies(context)
            return True
        if attempt < MAX_LOGIN_RETRIES:
            time.sleep(3)

    logger.error("로그인 최대 재시도 횟수 초과")
    return False

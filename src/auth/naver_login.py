"""
네이버 로그인 모듈
1. 쿠키 파일 존재 → 쿠키 복원 → 로그인 상태 검증
2. 쿠키 없거나 만료 → ID/PW 직접 로그인 → 쿠키 저장

네이버 로그인 페이지 구조 (2026년 기준):
  - 기본 탭이 QR코드 → "ID/전화번호" 탭(a.menu_id) 클릭 필요
  - ID 입력: input#id, PW 입력: input#pw
  - 로그인 버튼: button#log.login (텍스트: "다음")
"""
import asyncio
import json
import os
import random

from playwright.async_api import BrowserContext, Page, async_playwright

from config.settings import (
    COOKIES_PATH,
    ELEMENT_TIMEOUT,
    MAX_LOGIN_RETRIES,
    NAVER_LOGIN_URL,
    PAGE_LOAD_TIMEOUT,
)
from src.utils.logger import logger


class _LoginBlockedError(Exception):
    """2FA/캡차/디바이스 인증 등으로 자동 로그인 불가 시 발생"""


async def _detect_login_block(page: Page, current_url: str) -> str | None:
    """로그인 후 페이지가 2FA/캡차/디바이스 인증인지 감지. 감지 시 사유 문자열 반환."""
    url_lower = current_url.lower()

    # URL 패턴으로 감지
    url_keywords = {
        "2fa": "2단계 인증",
        "two_step": "2단계 인증",
        "otp": "OTP 인증",
        "captcha": "캡차",
        "recaptcha": "캡차",
        "device": "기기 인증",
        "protect": "보호 조치",
        "security": "보안 확인",
        "new_device": "새 기기 인증",
    }
    for keyword, reason in url_keywords.items():
        if keyword in url_lower:
            return reason

    # 페이지 내용으로 감지
    try:
        content = await page.content()
        content_keywords = [
            ("인증번호", "인증번호 입력 요구"),
            ("본인확인", "본인확인 요구"),
            ("새로운 환경", "새 환경 로그인 차단"),
            ("보호조치", "계정 보호조치"),
            ("캡차", "캡차"),
            ("자동입력 방지", "캡차"),
            ("기기 등록", "기기 등록 요구"),
        ]
        for keyword, reason in content_keywords:
            if keyword in content:
                return reason
    except Exception:
        pass

    return None


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
    """현재 세션 쿠키를 파일로 저장 (소유자만 읽기/쓰기) + Supabase 동기화"""
    COOKIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    cookies = await context.cookies()
    with open(COOKIES_PATH, "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)
    os.chmod(COOKIES_PATH, 0o600)
    logger.info(f"쿠키 저장 완료: {COOKIES_PATH}")

    # Supabase 양방향 동기화 (실패해도 로컬 저장은 이미 완료)
    try:
        from src.storage.supabase_client import save_bot_cookies_sb
        save_bot_cookies_sb(cookies)
        logger.info("쿠키 Supabase 동기화 완료")
    except Exception as e:
        logger.warning(f"쿠키 Supabase 동기화 실패 (로컬은 정상): {e}")


def _normalize_cookies(cookies: list[dict]) -> list[dict]:
    """
    EditThisCookie/Chrome 쿠키를 Playwright 형식으로 변환.
    Chrome: expirationDate, sameSite="no_restriction"
    Playwright: expires, sameSite="None"
    """
    _same_site_map = {
        "no_restriction": "None",
        "unspecified": "Lax",
        "lax": "Lax",
        "strict": "Strict",
        "none": "None",
        "None": "None",
        "Lax": "Lax",
        "Strict": "Strict",
    }

    result: list[dict] = []
    for c in cookies:
        normalized: dict = {
            "name": c["name"],
            "value": c["value"],
            "domain": c.get("domain", ""),
            "path": c.get("path", "/"),
        }
        if "expires" in c:
            normalized["expires"] = c["expires"]
        elif "expirationDate" in c:
            normalized["expires"] = int(c["expirationDate"])
        if "httpOnly" in c:
            normalized["httpOnly"] = c["httpOnly"]
        if "secure" in c:
            normalized["secure"] = c["secure"]

        same_site = c.get("sameSite", "")
        if same_site:
            normalized["sameSite"] = _same_site_map.get(str(same_site), "Lax")

        result.append(normalized)
    return result


async def _load_cookies(context: BrowserContext) -> bool:
    """
    쿠키 복원. Supabase 우선 → 로컬 파일 폴백.
    EditThisCookie(Chrome 확장) 형식도 자동 변환.
    """
    # 1. Supabase에서 업로드된 쿠키 시도
    try:
        from src.storage.supabase_client import get_bot_cookies_sb
        sb_cookies = get_bot_cookies_sb()
        if sb_cookies:
            normalized = _normalize_cookies(sb_cookies)
            await context.add_cookies(normalized)
            logger.info(f"쿠키 복원 완료 (Supabase, {len(normalized)}개)")
            return True
    except Exception as e:
        logger.debug(f"Supabase 쿠키 로드 실패 (로컬 폴백): {e}")

    # 2. 로컬 파일 폴백
    if not COOKIES_PATH.exists():
        return False
    with open(COOKIES_PATH, encoding="utf-8") as f:
        cookies = json.load(f)
    await context.add_cookies(cookies)
    logger.info("쿠키 복원 완료 (로컬 파일)")
    return True


async def _do_login(page: Page, naver_id: str, naver_pw: str) -> bool:
    """ID/PW로 직접 로그인 시도. 성공 여부 반환"""
    await page.goto(NAVER_LOGIN_URL, timeout=PAGE_LOAD_TIMEOUT)
    await asyncio.sleep(random.uniform(1.0, 2.0))

    # 2026년 기준: 기본 탭이 QR코드 → ID/PW 탭으로 전환
    try:
        id_tab = page.locator("a.menu_id")
        if await id_tab.count() > 0:
            await id_tab.click()
            await asyncio.sleep(random.uniform(0.8, 1.5))
            logger.info("ID/PW 탭으로 전환 완료")
    except Exception:
        logger.debug("ID/PW 탭 전환 스킵 (이미 ID 탭이거나 구조 변경)")

    await page.wait_for_selector("#id", timeout=ELEMENT_TIMEOUT)

    # fill() 대신 press_sequentially()로 실제 키 이벤트 발생
    id_field = page.locator("#id")
    await id_field.click()
    await asyncio.sleep(random.uniform(0.2, 0.5))
    await id_field.press_sequentially(naver_id, delay=random.randint(60, 120))
    await asyncio.sleep(random.uniform(0.3, 0.8))

    pw_field = page.locator("#pw")
    await pw_field.click()
    await asyncio.sleep(random.uniform(0.2, 0.5))
    await pw_field.press_sequentially(naver_pw, delay=random.randint(60, 120))
    await asyncio.sleep(random.uniform(0.3, 0.8))

    await page.click("#log\\.login")

    # 로그인 결과 대기 (성공 or 에러 메시지 or 2FA/캡차)
    try:
        await page.wait_for_url("https://www.naver.com/**", timeout=15_000)
        logger.info("로그인 성공")
        return True
    except Exception:
        current_url = page.url
        # 2FA / 캡차 / 디바이스 인증 감지
        block_reason = await _detect_login_block(page, current_url)
        if block_reason:
            logger.error(f"로그인 차단 감지: {block_reason} (url={current_url})")
            # 2FA/캡차는 재시도해도 동일하므로 즉시 중단 신호
            raise _LoginBlockedError(block_reason)

        error_text = ""
        try:
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
        try:
            success = await _do_login(page, naver_id, naver_pw)
        except _LoginBlockedError as e:
            logger.error(f"자동 로그인 불가 — {e}. 수동 로그인 필요 (python save_cookies.py)")
            return False
        if success:
            await _save_cookies(context)
            return True
        if attempt < MAX_LOGIN_RETRIES:
            await asyncio.sleep(3)

    logger.error("로그인 최대 재시도 횟수 초과")
    return False

"""
세션 관리 모듈 — 로그인 상태 모니터링 및 자동 갱신

사용 흐름:
  1. 주기적 로그인 상태 확인 (is_session_valid)
  2. 만료 시 자동 재로그인 (refresh_session)
  3. 실패 시 텔레그램 알림 (notify_login_failure)
"""
import asyncio
from datetime import datetime, timedelta

from playwright.async_api import BrowserContext, Page

from config.settings import PAGE_LOAD_TIMEOUT
from src.auth.naver_login import ensure_login
from src.utils.logger import logger

# 마지막 세션 확인 시간
_last_check_time: datetime | None = None
_check_interval_minutes = 10  # 10분마다 세션 체크


async def is_session_valid(page: Page) -> bool:
    """
    현재 로그인 세션이 유효한지 확인
    - 네이버 메인 접속 → 로그아웃 버튼 존재 여부 확인
    """
    try:
        await page.goto("https://www.naver.com", timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_load_state("domcontentloaded", timeout=PAGE_LOAD_TIMEOUT)
        
        # 로그아웃 버튼 셀렉터들
        logout_selectors = [
            ".MyView-module__btn_logout___gE2Uf",
            "#gnb_logout",
            ".link_logout",
            "a[href*='nidlogin.logout']",
            "[class*='btn_logout']",
        ]
        
        for selector in logout_selectors:
            try:
                el = await page.query_selector(selector)
                if el:
                    is_visible = await el.is_visible()
                    if is_visible:
                        return True
            except Exception:
                continue
        
        # 페이지 내용에 "로그아웃" 텍스트 확인
        content = await page.content()
        if "로그아웃" in content:
            return True
            
        return False
    except Exception as e:
        logger.warning(f"세션 확인 중 오류: {e}")
        return False


async def refresh_session(
    context: BrowserContext,
    page: Page,
    naver_id: str,
    naver_pw: str,
) -> bool:
    """
    세션 갱신 시도
    - 기존 쿠키 삭제 후 재로그인
    """
    logger.info("세션 갱신 시도...")
    
    # 기존 쿠키 삭제
    await context.clear_cookies()
    
    # 재로그인
    success = await ensure_login(context, page, naver_id, naver_pw)
    
    if success:
        global _last_check_time
        _last_check_time = datetime.now()
        logger.info("세션 갱신 성공")
    else:
        logger.error("세션 갱신 실패 — 수동 로그인 필요")
    
    return success


async def check_and_refresh_session(
    context: BrowserContext,
    page: Page,
    naver_id: str,
    naver_pw: str,
    force: bool = False,
) -> bool:
    """
    세션 상태 확인 및 필요시 갱신
    
    Args:
        force: True면 체크 주기 무시하고 강제 확인
    
    Returns:
        세션 유효 여부
    """
    global _last_check_time
    
    # 주기 체크 (force가 아니면 10분마다)
    if not force and _last_check_time:
        elapsed = datetime.now() - _last_check_time
        if elapsed < timedelta(minutes=_check_interval_minutes):
            return True  # 아직 체크 주기 아님, 유효하다고 가정
    
    # 실제 세션 확인
    is_valid = await is_session_valid(page)
    _last_check_time = datetime.now()
    
    if is_valid:
        logger.debug("세션 유효함")
        return True
    
    # 세션 만료 — 갱신 시도
    logger.warning("세션 만료 감지 — 자동 재로그인 시도")
    return await refresh_session(context, page, naver_id, naver_pw)


def get_session_status() -> dict:
    """현재 세션 상태 정보 반환"""
    if _last_check_time is None:
        return {
            "status": "unknown",
            "last_check": None,
            "minutes_since_check": None,
        }
    
    elapsed = datetime.now() - _last_check_time
    return {
        "status": "active" if elapsed < timedelta(minutes=_check_interval_minutes * 2) else "stale",
        "last_check": _last_check_time.isoformat(),
        "minutes_since_check": int(elapsed.total_seconds() / 60),
    }


async def with_session_check(
    context: BrowserContext,
    page: Page,
    naver_id: str,
    naver_pw: str,
    operation: callable,
    operation_name: str = "작업",
    max_retries: int = 1,
):
    """
    세션 체크를 감싸는 래퍼
    - 작업 전 세션 확인
    - 실패 시 세션 갱신 후 재시도
    - 최종 실패 시 예외 발생
    
    사용 예:
        result = await with_session_check(
            context, page, id, pw,
            lambda: write_comment(page, url, title),
            "댓글 작성"
        )
    """
    # 세션 확인
    session_ok = await check_and_refresh_session(context, page, naver_id, naver_pw)
    if not session_ok:
        raise RuntimeError("로그인 세션 유효하지 않음 — 수동 로그인 필요")
    
    # 작업 실행
    for attempt in range(max_retries + 1):
        try:
            return await operation()
        except Exception as e:
            error_str = str(e).lower()
            
            # 로그인 관련 오류인지 확인
            is_auth_error = any(keyword in error_str for keyword in [
                "login", "로그인", "auth", "인증", "session", "세션",
                "cookie", "쿠키", "unauthorized", "unauthenticated"
            ])
            
            if is_auth_error and attempt < max_retries:
                logger.warning(f"{operation_name} 중 인증 오류 — 세션 갱신 후 재시도")
                refreshed = await refresh_session(context, page, naver_id, naver_pw)
                if not refreshed:
                    raise RuntimeError("세션 갱신 실패 — 수동 로그인 필요")
                continue
            
            # 다른 오류거나 마지막 시도
            raise
    
    return None

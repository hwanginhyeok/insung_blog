"""
Playwright 브라우저 공통 설정 — 봇 감지 회피용 user-agent, viewport 등 중앙 관리

사용법:
  async with create_browser(headless=True) as browser, context, page:
      ...
"""
from playwright.async_api import Browser, BrowserContext, Page, Playwright


# 봇 감지 회피용 User-Agent (2026년 기준 Chrome 최신)
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/133.0.0.0 Safari/537.36"
)

_VIEWPORT = {"width": 1280, "height": 800}

_BROWSER_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
]


async def create_browser(
    pw: Playwright,
    headless: bool = True,
) -> tuple[Browser, BrowserContext, Page]:
    """
    Playwright 브라우저 + 컨텍스트 + 페이지 생성.

    Args:
        pw: async_playwright() 인스턴스
        headless: True=백그라운드, False=화면 표시

    Returns:
        (browser, context, page) 튜플
    """
    browser = await pw.chromium.launch(
        headless=headless,
        args=_BROWSER_ARGS,
    )
    context = await browser.new_context(
        user_agent=_USER_AGENT,
        viewport=_VIEWPORT,
        locale="ko-KR",
    )
    page = await context.new_page()
    return browser, context, page

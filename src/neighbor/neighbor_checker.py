"""
이웃 여부 확인 — 블로그 방문 시 프로필 영역에서 이웃 상태 판별.

확인 방법:
  - mainFrame 내 프로필 영역에서 "이웃추가" 버튼 유무로 판별
  - "서로이웃" 텍스트 존재 → mutual
  - "이웃" 텍스트만 존재 → one_way_following
  - "이웃추가" 버튼 존재 → 이웃 아님 (None)
"""
from playwright.async_api import Page

from src.utils.logger import setup_logger

logger = setup_logger("neighbor_checker")

# ── 폴백 셀렉터 체인 ──
# 네이버 셀렉터가 언제든 바뀔 수 있으므로 여러 패턴을 순서대로 시도한다.

# 이웃 상태 표시 영역 셀렉터 (우선순위 순)
_NEIGHBOR_STATUS_SELECTORS = [
    '[class*="buddy_type"], [class*="neighbor"], .blog_neighbor',
    '.buddy_wrap span, .area_buddy span',
    '[class*="relation"] span, [class*="buddy"] span',
]

# 이웃추가 버튼 셀렉터 (우선순위 순)
_ADD_BUTTON_SELECTORS = [
    (
        'a.btn_addbuddy, a.btn_add_nb._addBuddyPop, '
        'a.btn_add_buddy._addBuddy, '
        'a[class*="buddy_add"], button[class*="neighbor_add"], '
        'a[href*="BuddyAdd"], .btn_buddy_add'
    ),
    'a[class*="add_buddy"], button[class*="add_buddy"]',
    '[class*="buddy"] a[href*="Add"], [class*="neighbor"] button',
]

# 프로필 영역 셀렉터 (우선순위 순)
_PROFILE_AREA_SELECTORS = [
    '.blog-profile, .area_profile, #profileArea, .profile_area',
    '.area_info, .profile_info, #header .area_profile',
    '[class*="profile"], [id*="profile"]',
]


async def _query_with_fallback(frame, selectors: list[str], label: str):
    """폴백 셀렉터 체인으로 요소 탐색. 첫 번째 매칭 반환."""
    for i, selector in enumerate(selectors):
        try:
            el = await frame.query_selector(selector)
            if el:
                return el
        except Exception:
            # 셀렉터 문법 에러 등은 무시하고 다음 시도
            continue
    return None


async def check_neighbor_status(page: Page, blog_id: str) -> str | None:
    """
    블로그 방문 후 이웃 상태 확인.

    Returns:
        'mutual' — 서로이웃
        'one_way_following' — 내가 이웃 추가한 상태
        'one_way_follower' — 상대만 이웃 추가 (확인 어려움, 일단 None)
        None — 이웃 아님 또는 확인 불가
    """
    try:
        blog_url = f"https://blog.naver.com/{blog_id}"
        await page.goto(blog_url, wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(2000)

        # mainFrame에서 프로필 영역 탐색
        main_frame = page.main_frame
        for frame in page.frames:
            if "blog.naver.com" in (frame.url or ""):
                main_frame = frame
                break

        # 서로이웃 표시 확인 (폴백 셀렉터 체인)
        mutual_el = await _query_with_fallback(
            main_frame, _NEIGHBOR_STATUS_SELECTORS, "이웃 상태"
        )
        if mutual_el:
            text = (await mutual_el.inner_text()).strip()
            if "서로이웃" in text:
                logger.debug(f"{blog_id}: 서로이웃 확인")
                return "mutual"
            if "이웃" in text:
                logger.debug(f"{blog_id}: 일방 이웃 확인")
                return "one_way_following"

        # "이웃추가" 버튼 존재 여부 (폴백 셀렉터 체인)
        add_btn = await _query_with_fallback(
            main_frame, _ADD_BUTTON_SELECTORS, "이웃추가 버튼"
        )
        if add_btn:
            btn_text = (await add_btn.inner_text()).strip()
            if "이웃추가" in btn_text or "이웃 추가" in btn_text:
                logger.debug(f"{blog_id}: 이웃 아님 (이웃추가 버튼 존재)")
                return None

        # 프로필 영역 전체 텍스트에서 키워드 검색 (폴백 셀렉터 체인)
        profile_area = await _query_with_fallback(
            main_frame, _PROFILE_AREA_SELECTORS, "프로필 영역"
        )
        if profile_area:
            profile_text = await profile_area.inner_text()
            if "서로이웃" in profile_text:
                return "mutual"
            if "이웃" in profile_text and "이웃추가" not in profile_text:
                return "one_way_following"

        # 모든 셀렉터 실패 — 셀렉터 업데이트 경고
        logger.warning(
            f"{blog_id}: 모든 셀렉터 매칭 실패 — 셀렉터 업데이트 필요. "
            f"neighbor_checker.py의 셀렉터 목록을 확인하세요."
        )
        return None

    except Exception as e:
        logger.warning(f"{blog_id}: 이웃 상태 확인 실패 — {e}")
        return None

"""
실행 허용 시간대 체크 — Supabase 설정 기반 동적 시간대

- 평일: 설정된 시간대 (기본 20~24시)
- 주말: 설정된 시간대 (기본 13~18시)
- Supabase 접속 실패 시 기본값 폴백
"""
from datetime import datetime

from src.utils.logger import logger

# Supabase 접속 불가 시 폴백 기본값
_DEFAULT_WEEKDAY = {"start": 20, "end": 24}
_DEFAULT_WEEKEND = {"start": 13, "end": 18}


def _load_hours() -> tuple[dict, dict]:
    """Supabase에서 시간대 설정 로드. 실패 시 기본값 반환."""
    try:
        from src.storage.supabase_client import get_bot_settings_sb
        settings = get_bot_settings_sb()
        return (
            settings.get("weekday_hours", _DEFAULT_WEEKDAY),
            settings.get("weekend_hours", _DEFAULT_WEEKEND),
        )
    except Exception as e:
        logger.warning(f"Supabase 시간대 설정 로드 실패, 기본값 사용: {e}")
        return _DEFAULT_WEEKDAY, _DEFAULT_WEEKEND


def is_allowed_time() -> bool:
    """현재 시각이 허용 시간대인지 확인 (평일/주말 구분)"""
    now = datetime.now()
    weekday_hours, weekend_hours = _load_hours()

    if now.weekday() >= 5:
        start, end = weekend_hours["start"], weekend_hours["end"]
    else:
        start, end = weekday_hours["start"], weekday_hours["end"]

    return start <= now.hour < end


def assert_allowed_time() -> None:
    """허용 시간대가 아닐 경우 RuntimeError 발생"""
    if not is_allowed_time():
        now = datetime.now()
        weekday_hours, weekend_hours = _load_hours()

        if now.weekday() >= 5:
            start, end = weekend_hours["start"], weekend_hours["end"]
            day_type = "주말"
        else:
            start, end = weekday_hours["start"], weekday_hours["end"]
            day_type = "평일"

        raise RuntimeError(
            f"현재 시각 {now.strftime('%H:%M')}은 "
            f"{day_type} 허용 시간대({start}~{end}시)가 아닙니다."
        )


def get_current_time_range() -> tuple[int, int, str]:
    """현재 적용 중인 시간대 반환 (start, end, day_type)"""
    now = datetime.now()
    weekday_hours, weekend_hours = _load_hours()

    if now.weekday() >= 5:
        start, end = weekend_hours["start"], weekend_hours["end"]
        day_type = "주말"
    else:
        start, end = weekday_hours["start"], weekday_hours["end"]
        day_type = "평일"

    return start, end, day_type

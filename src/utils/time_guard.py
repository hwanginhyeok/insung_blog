"""
실행 허용 시간대 체크 (오후 8시 ~ 자정)
네이버 봇 감지 회피: 접속자 많은 시간대에만 활동
"""
from datetime import datetime

from config.settings import ALLOWED_HOUR_END, ALLOWED_HOUR_START


def is_allowed_time() -> bool:
    """현재 시각이 허용 시간대(9~23시)인지 확인"""
    hour = datetime.now().hour
    return ALLOWED_HOUR_START <= hour < ALLOWED_HOUR_END


def assert_allowed_time() -> None:
    """허용 시간대가 아닐 경우 RuntimeError 발생"""
    if not is_allowed_time():
        now = datetime.now().strftime("%H:%M")
        raise RuntimeError(
            f"현재 시각 {now}은 허용 시간대({ALLOWED_HOUR_START}~{ALLOWED_HOUR_END}시)가 아닙니다."
        )

"""
로깅 설정 — 파일 + 콘솔 동시 출력
모듈별 로그 파일 지원
"""
import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from config.settings import (
    LOG_PATH_COMMENTER,
    LOG_PATH_TELEGRAM,
    LOG_PATH_API,
    LOG_PATH_PUBLISHER,
)


def setup_logger(name: str = "commenter", log_path: Path | None = None) -> logging.Logger:
    """
    모듈별 로거 설정
    
    Args:
        name: 로거 이름 (commenter, telegram, api, publisher)
        log_path: 로그 파일 경로 (None이면 name에 따라 자동 선택)
    """
    # 로그 경로 자동 선택
    if log_path is None:
        path_map = {
            "commenter": LOG_PATH_COMMENTER,
            "telegram": LOG_PATH_TELEGRAM,
            "api": LOG_PATH_API,
            "publisher": LOG_PATH_PUBLISHER,
        }
        log_path = path_map.get(name, LOG_PATH_COMMENTER)
    
    # 로그 디렉토리 생성
    log_path.parent.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger(name)
    if logger.handlers:
        return logger  # 이미 설정된 경우 재설정 방지

    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # 파일 핸들러 (10MB 롤오버, 최대 3개 보관)
    fh = RotatingFileHandler(log_path, maxBytes=10 * 1024 * 1024, backupCount=3, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)

    # 콘솔 핸들러
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger


# 기본 로거 (하위 호환성)
logger = setup_logger("commenter")

# 모듈별 로거 생성 함수
def get_commenter_logger() -> logging.Logger:
    """댓글 봇용 로거"""
    return setup_logger("commenter")


def get_telegram_logger() -> logging.Logger:
    """텔레그램 봇용 로거"""
    return setup_logger("telegram")


def get_api_logger() -> logging.Logger:
    """API 서버용 로거"""
    return setup_logger("api")


def get_publisher_logger() -> logging.Logger:
    """발행 모듈용 로거"""
    return setup_logger("publisher")

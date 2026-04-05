"""
랜덤 딜레이 유틸리티 — 봇 감지 회피를 위한 인간적 타이밍 시뮬레이션
"""
import asyncio
import random

from config.settings import (
    DELAY_BETWEEN_BLOGGERS_MAX,
    DELAY_BETWEEN_BLOGGERS_MIN,
    DELAY_BETWEEN_COMMENTS_MAX,
    DELAY_BETWEEN_COMMENTS_MIN,
    DELAY_TYPING_MAX,
    DELAY_TYPING_MIN,
)


async def delay_between_comments() -> None:
    """댓글과 댓글 사이 대기 (5~15초)"""
    secs = random.uniform(DELAY_BETWEEN_COMMENTS_MIN, DELAY_BETWEEN_COMMENTS_MAX)
    await asyncio.sleep(secs)


async def delay_between_bloggers() -> None:
    """블로거와 블로거 사이 대기 — 정규 분포로 자연스러운 간격.

    중앙값 30초 부근에 몰리고, 가끔 짧거나 길게.
    uniform(20,40)보다 사람 패턴에 가까움.
    """
    center = (DELAY_BETWEEN_BLOGGERS_MIN + DELAY_BETWEEN_BLOGGERS_MAX) / 2  # 30
    stddev = (DELAY_BETWEEN_BLOGGERS_MAX - DELAY_BETWEEN_BLOGGERS_MIN) / 4  # 5
    secs = max(DELAY_BETWEEN_BLOGGERS_MIN * 0.75, random.gauss(center, stddev))
    await asyncio.sleep(secs)


async def delay_typing() -> None:
    """글자 타이핑 간격 (0.05~0.15초)"""
    secs = random.uniform(DELAY_TYPING_MIN, DELAY_TYPING_MAX)
    await asyncio.sleep(secs)


async def delay_short() -> None:
    """짧은 인터랙션 딜레이 (0.3~1.0초)"""
    await asyncio.sleep(random.uniform(0.3, 1.0))

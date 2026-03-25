"""
이미지 다운로드 유틸리티 — URL → 로컬 임시 파일

임시저장 시 Supabase Storage URL을 로컬 파일로 다운로드하여
Playwright의 file chooser를 통해 네이버에 업로드할 수 있게 한다.
"""
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests

from src.utils.logger import logger

# 다운로드 제한
_MAX_SIZE_MB = 10
_TIMEOUT_SEC = 30


def download_images(urls: list[str]) -> list[str]:
    """URL 리스트를 로컬 임시 파일로 다운로드.

    Args:
        urls: 이미지 URL 리스트 (Supabase Storage public URL 등)

    Returns:
        다운로드된 로컬 파일 경로 리스트 (실패한 URL은 건너뜀)
    """
    paths: list[str] = []

    for url in urls:
        if not url or not url.startswith("http"):
            continue

        try:
            # 확장자 추출
            parsed = urlparse(url)
            suffix = Path(parsed.path).suffix or ".jpg"
            if suffix not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                suffix = ".jpg"

            resp = requests.get(url, timeout=_TIMEOUT_SEC, stream=True)
            resp.raise_for_status()

            # 크기 체크
            content_length = resp.headers.get("content-length")
            if content_length and int(content_length) > _MAX_SIZE_MB * 1024 * 1024:
                logger.warning(f"이미지 크기 초과 ({int(content_length) / 1024 / 1024:.1f}MB): {url[:80]}")
                continue

            # 임시 파일에 저장
            tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
            for chunk in resp.iter_content(chunk_size=8192):
                tmp.write(chunk)
            tmp.close()

            paths.append(tmp.name)
            logger.info(f"이미지 다운로드 완료: {url[:60]}... → {tmp.name}")

        except Exception as e:
            logger.warning(f"이미지 다운로드 실패: {url[:60]}... — {e}")
            continue

    return paths


def cleanup_images(paths: list[str]) -> None:
    """다운로드된 임시 파일 삭제."""
    for p in paths:
        try:
            Path(p).unlink(missing_ok=True)
        except Exception:
            pass

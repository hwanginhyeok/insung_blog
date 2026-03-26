"""
이미지 다운로드 유틸리티 — URL → 로컬 임시 파일

임시저장 시 Supabase Storage URL을 로컬 파일로 다운로드하여
Playwright의 file chooser를 통해 네이버에 업로드할 수 있게 한다.
"""
import ipaddress
import socket
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests

from src.utils.logger import logger

# 다운로드 제한
_MAX_SIZE_MB = 10
_TIMEOUT_SEC = 30

# SSRF 방어: 허용 도메인 화이트리스트
_ALLOWED_DOMAINS = (
    ".supabase.co",
    ".supabase.com",
    "supabase.co",
    "supabase.com",
)


def _is_safe_url(url: str) -> bool:
    """SSRF 방어: 허용된 도메인만 통과, private IP 차단."""
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""

        # 도메인 화이트리스트 체크
        if not any(hostname == d or hostname.endswith(d) for d in _ALLOWED_DOMAINS):
            logger.warning(f"허용되지 않은 도메인: {hostname}")
            return False

        # private/loopback IP 차단
        resolved = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(resolved)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            logger.warning(f"private IP 차단: {hostname} → {resolved}")
            return False

        return True
    except Exception as e:
        logger.warning(f"URL 검증 실패: {url[:60]} — {e}")
        return False


def download_images(urls: list[str]) -> list[str]:
    """URL 리스트를 로컬 임시 파일로 다운로드.

    Args:
        urls: 이미지 URL 리스트 (Supabase Storage public URL만 허용)

    Returns:
        다운로드된 로컬 파일 경로 리스트 (실패한 URL은 건너뜀)
    """
    paths: list[str] = []
    max_bytes = _MAX_SIZE_MB * 1024 * 1024

    for url in urls:
        if not url or not url.startswith("http"):
            continue

        # SSRF 방어: 도메인 + IP 검증
        if not _is_safe_url(url):
            continue

        try:
            # 확장자 추출
            parsed = urlparse(url)
            suffix = Path(parsed.path).suffix or ".jpg"
            if suffix not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                suffix = ".jpg"

            resp = requests.get(url, timeout=_TIMEOUT_SEC, stream=True)
            resp.raise_for_status()

            # 스트리밍 다운로드 + 실제 바이트 수 기반 크기 제한
            tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
            downloaded = 0
            for chunk in resp.iter_content(chunk_size=8192):
                downloaded += len(chunk)
                if downloaded > max_bytes:
                    tmp.close()
                    Path(tmp.name).unlink(missing_ok=True)
                    logger.warning(f"이미지 크기 초과 ({downloaded / 1024 / 1024:.1f}MB): {url[:80]}")
                    break
            else:
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

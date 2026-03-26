"""image_downloader SSRF 방어 + 다운로드 테스트"""
import os
import sys
import tempfile
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from src.utils.image_downloader import _is_safe_url, download_images, cleanup_images


class TestIsSafeUrl:
    """SSRF 방어: _is_safe_url"""

    def test_supabase_url_allowed(self):
        """Supabase Storage URL → 허용"""
        with patch("socket.gethostbyname", return_value="104.18.5.22"):
            assert _is_safe_url("https://xxx.supabase.co/storage/v1/object/public/photos/a.jpg")

    def test_supabase_com_allowed(self):
        with patch("socket.gethostbyname", return_value="104.18.5.22"):
            assert _is_safe_url("https://xxx.supabase.com/storage/v1/object/a.jpg")

    def test_localhost_blocked(self):
        """localhost → 차단"""
        assert not _is_safe_url("http://localhost:8001/secret")

    def test_aws_metadata_blocked(self):
        """AWS 메타데이터 IP → 차단"""
        assert not _is_safe_url("http://169.254.169.254/latest/meta-data/")

    def test_private_ip_blocked(self):
        """내부 네트워크 IP → 차단"""
        assert not _is_safe_url("http://10.0.0.1/internal")

    def test_evil_domain_blocked(self):
        """허용되지 않은 도메인 → 차단"""
        assert not _is_safe_url("https://evil.com/image.jpg")

    def test_empty_url(self):
        """빈 URL → 차단"""
        assert not _is_safe_url("")

    def test_supabase_private_ip_blocked(self):
        """도메인은 supabase지만 private IP로 해석 → 차단"""
        with patch("socket.gethostbyname", return_value="127.0.0.1"):
            assert not _is_safe_url("https://evil.supabase.co/image.jpg")


class TestDownloadImages:
    """download_images 함수 테스트"""

    def test_empty_list(self):
        """빈 URL 리스트 → 빈 결과"""
        assert download_images([]) == []

    def test_blocked_domain(self):
        """허용되지 않은 도메인 → 다운로드 안 함"""
        paths = download_images(["https://evil.com/image.jpg"])
        assert paths == []


class TestCleanupImages:
    """cleanup_images 함수 테스트"""

    def test_cleanup_existing_files(self):
        """임시 파일 삭제"""
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as f:
            path = f.name
            f.write(b"fake image data")

        assert os.path.exists(path)
        cleanup_images([path])
        assert not os.path.exists(path)

    def test_cleanup_nonexistent_file(self):
        """없는 파일도 에러 없이 처리"""
        cleanup_images(["/tmp/nonexistent_file_12345.jpg"])  # 에러 안 남

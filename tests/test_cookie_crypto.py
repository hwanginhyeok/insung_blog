"""쿠키 암호화/복호화 테스트."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from cryptography.fernet import Fernet
os.environ.setdefault("COOKIE_ENCRYPTION_KEY", Fernet.generate_key().decode())

from src.utils.cookie_crypto import encrypt_cookies, decrypt_cookies, is_encrypted


SAMPLE_COOKIES = [
    {"name": "NID_AUT", "value": "secret123", "domain": ".naver.com"},
    {"name": "NID_SES", "value": "session456", "domain": ".naver.com"},
]


class TestFernetEncryption:
    """Fernet 암호화/복호화."""

    def test_암호화_후_복호화(self):
        encrypted = encrypt_cookies(SAMPLE_COOKIES)
        parsed = json.loads(encrypted)
        assert parsed["encrypted"] is True

        result = decrypt_cookies(parsed)
        assert len(result) == 2
        assert result[0]["name"] == "NID_AUT"
        assert result[0]["value"] == "secret123"

    def test_암호화된_데이터는_원본_포함_안함(self):
        encrypted = encrypt_cookies(SAMPLE_COOKIES)
        assert "secret123" not in encrypted
        assert "NID_AUT" not in encrypted

    def test_is_encrypted_판별(self):
        encrypted = encrypt_cookies(SAMPLE_COOKIES)
        parsed = json.loads(encrypted)
        assert is_encrypted(parsed) is True
        assert is_encrypted(SAMPLE_COOKIES) is False
        assert is_encrypted("plain string") is False


class TestBackwardCompatibility:
    """평문 쿠키 하위 호환."""

    def test_평문_리스트_그대로_반환(self):
        result = decrypt_cookies(SAMPLE_COOKIES)
        assert result == SAMPLE_COOKIES

    def test_단일_dict_리스트로_래핑(self):
        single = {"name": "test", "value": "val"}
        result = decrypt_cookies(single)
        assert result == [single]

    def test_빈_리스트(self):
        result = decrypt_cookies([])
        assert result == []

    def test_json_문자열_파싱(self):
        json_str = json.dumps(SAMPLE_COOKIES)
        result = decrypt_cookies(json_str)
        assert len(result) == 2


class TestErrorHandling:
    """에러 케이스."""

    def test_잘못된_암호화_데이터(self):
        bad_data = {"encrypted": True, "data": "invalid_token_data"}
        result = decrypt_cookies(bad_data)
        assert result == []

    def test_키_없으면_encrypt_실패(self):
        import src.utils.cookie_crypto as mod
        old_key = mod._KEY
        mod._KEY = None
        old_env = os.environ.pop("COOKIE_ENCRYPTION_KEY", None)
        try:
            try:
                encrypt_cookies(SAMPLE_COOKIES)
                assert False, "예외가 발생해야 함"
            except ValueError:
                pass  # 예상대로 키 없음 에러
        finally:
            if old_env:
                os.environ["COOKIE_ENCRYPTION_KEY"] = old_env
            mod._KEY = old_key

"""쿠키 데이터 암호화/복호화 유틸.

Fernet(AES-128-CBC + HMAC-SHA256)으로 쿠키 JSON을 암호화.
암호화된 데이터는 base64 문자열로 Supabase JSONB에 저장.

키: .env COOKIE_ENCRYPTION_KEY (Fernet 키 형식)
"""
import base64
import hashlib
import json
import os

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding as sym_padding

from src.utils.logger import setup_logger

logger = setup_logger("cookie_crypto")

_KEY: bytes | None = None


def _get_key() -> bytes:
    """환경변수에서 암호화 키 로드. 없으면 예외."""
    global _KEY
    if _KEY is None:
        raw = os.environ.get("COOKIE_ENCRYPTION_KEY", "")
        if not raw:
            raise ValueError(
                "COOKIE_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다. "
                ".env에 추가하세요."
            )
        _KEY = raw.encode()
    return _KEY


def encrypt_cookies(cookies: list[dict]) -> str:
    """쿠키 리스트 → 암호화된 base64 문자열.

    저장 형식: {"encrypted": true, "data": "<fernet token>"}
    """
    key = _get_key()
    f = Fernet(key)
    raw_json = json.dumps(cookies, ensure_ascii=False)
    token = f.encrypt(raw_json.encode("utf-8"))
    return json.dumps({"encrypted": True, "data": token.decode("ascii")})


def decrypt_cookies(cookie_data: str | list | dict) -> list[dict]:
    """암호화된 데이터 또는 평문 쿠키 → 쿠키 리스트.

    하위 호환: 평문 쿠키(list)가 들어오면 그대로 반환.
    """
    # 이미 복호화된 리스트면 그대로 반환 (하위 호환)
    if isinstance(cookie_data, list):
        return cookie_data

    # dict인 경우: 암호화된 데이터 또는 단일 쿠키
    if isinstance(cookie_data, dict):
        if cookie_data.get("encrypted"):
            fmt = cookie_data.get("format", "fernet")
            try:
                if fmt == "aes-256-cbc":
                    # TypeScript에서 암호화한 포맷
                    return _decrypt_aes256cbc(cookie_data["data"])
                else:
                    # Python Fernet 포맷
                    key = _get_key()
                    f = Fernet(key)
                    decrypted = f.decrypt(cookie_data["data"].encode("ascii"))
                    return json.loads(decrypted.decode("utf-8"))
            except InvalidToken:
                logger.error("쿠키 복호화 실패 — 키가 변경되었거나 데이터 손상")
                return []
            except Exception as e:
                logger.error(f"쿠키 복호화 오류: {e}")
                return []
        else:
            # 단일 쿠키 dict (비정상)
            return [cookie_data]

    # 문자열인 경우: JSON 파싱 시도
    if isinstance(cookie_data, str):
        try:
            parsed = json.loads(cookie_data)
            return decrypt_cookies(parsed)
        except json.JSONDecodeError:
            logger.error("쿠키 데이터 JSON 파싱 실패")
            return []

    return []


def _decrypt_aes256cbc(data_str: str) -> list[dict]:
    """TypeScript에서 암호화한 AES-256-CBC 데이터 복호화.

    포맷: "base64(iv):base64(ciphertext)"
    키: COOKIE_ENCRYPTION_KEY의 SHA-256 해시 (TS와 동일)
    """
    raw_key = os.environ.get("COOKIE_ENCRYPTION_KEY", "")
    key = hashlib.sha256(raw_key.encode()).digest()

    iv_b64, cipher_b64 = data_str.split(":")
    iv = base64.b64decode(iv_b64)
    ciphertext = base64.b64decode(cipher_b64)

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()

    # PKCS7 언패딩
    unpadder = sym_padding.PKCS7(128).unpadder()
    plaintext = unpadder.update(padded) + unpadder.finalize()

    return json.loads(plaintext.decode("utf-8"))


def is_encrypted(cookie_data) -> bool:
    """데이터가 암호화되어 있는지 확인."""
    if isinstance(cookie_data, dict):
        return cookie_data.get("encrypted", False) is True
    if isinstance(cookie_data, str):
        try:
            parsed = json.loads(cookie_data)
            return isinstance(parsed, dict) and parsed.get("encrypted", False) is True
        except (json.JSONDecodeError, TypeError):
            return False
    return False

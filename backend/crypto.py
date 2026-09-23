from cryptography.fernet import Fernet
import base64, hashlib
from backend.config import FILE_ENC_KEY

def _get_key() -> bytes:
    digest = hashlib.sha256(FILE_ENC_KEY.encode()).digest()
    return base64.urlsafe_b64encode(digest)

_cipher = Fernet(_get_key())

def encrypt(value: str) -> str:
    if not value:
        return value
    return _cipher.encrypt(value.encode()).decode()

def decrypt(value: str) -> str:
    if not value:
        return value
    try:
        return _cipher.decrypt(value.encode()).decode()
    except Exception:
        return value

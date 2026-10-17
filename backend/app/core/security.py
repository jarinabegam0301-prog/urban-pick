import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt

PBKDF2_ITERATIONS = 600_000
TOKEN_ALGORITHM = "HS256"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt, digest = stored_hash.split("$")
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), _unb64(salt), int(iterations)
    )
    return hmac.compare_digest(candidate, _unb64(digest))


# Verified against when the email is unknown, so response time does not reveal
# which admin emails exist.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(16))


def create_session_token(admin_id: str, secret: str, hours: int) -> str:
    now = datetime.now(UTC)
    payload = {"sub": admin_id, "iat": now, "exp": now + timedelta(hours=hours)}
    return jwt.encode(payload, secret, algorithm=TOKEN_ALGORITHM)


def read_session_token(token: str, secret: str) -> str | None:
    try:
        payload = jwt.decode(token, secret, algorithms=[TOKEN_ALGORITHM])
    except jwt.PyJWTError:
        return None
    subject = payload.get("sub")
    return subject if isinstance(subject, str) else None

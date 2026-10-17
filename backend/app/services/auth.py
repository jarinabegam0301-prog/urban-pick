import threading
import time
import uuid
from datetime import UTC, datetime

from app.core.security import DUMMY_PASSWORD_HASH, hash_password, verify_password
from app.models.domain import Admin
from app.repositories.base import Repository
from app.services.errors import ServiceError, ValidationError

MAX_FAILURES = 5
FAILURE_WINDOW_SECONDS = 15 * 60


class TooManyAttemptsError(ServiceError):
    status_code = 429


class LoginLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._failures: dict[str, list[float]] = {}

    def _recent(self, key: str, now: float) -> list[float]:
        return [t for t in self._failures.get(key, []) if now - t < FAILURE_WINDOW_SECONDS]

    def check(self, key: str) -> None:
        with self._lock:
            if len(self._recent(key, time.monotonic())) >= MAX_FAILURES:
                raise TooManyAttemptsError("Too many failed attempts. Try again in 15 minutes.")

    def fail(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._failures[key] = [*self._recent(key, now), now]

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


login_limiter = LoginLimiter()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def authenticate(repo: Repository, email: str, password: str, client_key: str) -> Admin | None:
    email = normalize_email(email)
    key = f"{client_key}:{email}"
    login_limiter.check(key)
    admin = repo.get_admin_by_email(email)
    valid = verify_password(password, admin.password_hash if admin else DUMMY_PASSWORD_HASH)
    if admin is None or not valid:
        login_limiter.fail(key)
        return None
    login_limiter.reset(key)
    return admin


def change_password(repo: Repository, admin: Admin, current: str, new: str) -> None:
    if not verify_password(current, admin.password_hash):
        raise ValidationError("Current password is incorrect.")
    if current == new:
        raise ValidationError("Choose a password different from the current one.")
    repo.update_admin_password(admin.id, hash_password(new))


def ensure_initial_admin(repo: Repository, email: str, password: str, name: str) -> bool:
    """Create the first admin from configuration when no admin exists yet."""
    if repo.count_admins() > 0 or not password:
        return False
    repo.insert_admin(
        Admin(
            id=str(uuid.uuid4()),
            name=name,
            email=normalize_email(email),
            password_hash=hash_password(password),
            role="admin",
            created_at=datetime.now(UTC),
        )
    )
    return True

import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# Argon2id password hasher
ph = PasswordHasher()

SESSION_EXPIRE_HOURS: int = 7 * 24


def hash_password(plain: str) -> str:
    """Hash a plain-text password using Argon2id."""
    return ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plain password against its Argon2id hash."""
    try:
        ph.verify(hashed, plain)
        return True
    except VerifyMismatchError:
        return False


def generate_session_token() -> str:
    """Generate a cryptographically secure random session token."""
    return secrets.token_urlsafe(32)

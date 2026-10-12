"""Password hashing (scrypt, standard library) and JWT tokens (HS256)."""
import hashlib
import hmac
import os
import re
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import jwt

import config

_SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, **_SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), **_SCRYPT)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def create_token(user_id: int, workspace_id: int, role: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=config.TOKEN_TTL_HOURS)
    claims = {"sub": str(user_id), "ws": workspace_id, "role": role, "exp": expires}
    return jwt.encode(claims, config.jwt_secret(), algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, config.jwt_secret(), algorithms=["HS256"])


class RateLimiter:
    """Allow `limit` attempts per key in any 60-second window (in memory; fine for one process)."""

    def __init__(self) -> None:
        self.hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str, limit: int) -> bool:
        now = time.monotonic()
        window = self.hits[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= limit:
            return False
        window.append(now)
        return True

    def reset(self) -> None:
        self.hits.clear()


login_limiter = RateLimiter()

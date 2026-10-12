"""Request authentication: who is calling, which workspace, and what role."""
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import config
from auth.security import decode_token
from db.core import get_db

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    user_id: int
    workspace_id: int
    role: str
    name: str
    email: str


def current_principal(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db=Depends(get_db),
) -> Principal:
    unauthorised = HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue", headers={"WWW-Authenticate": "Bearer"})
    cookie = request.cookies.get(config.COOKIE_NAME)
    if creds is None and cookie is None:
        raise unauthorised
    if creds is None and request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get(config.CSRF_HEADER) != config.CSRF_VALUE:
        # a browser session may only change data from the web app, which sends this header on every request
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing request header")
    token = creds.credentials if creds is not None else cookie
    try:
        claims = decode_token(token)
    except jwt.PyJWTError:
        raise unauthorised from None
    row = db.execute(
        "SELECT u.id, u.name, u.email, m.role, m.workspace_id FROM users u "
        "JOIN memberships m ON m.user_id = u.id WHERE u.id = ? AND m.workspace_id = ?",
        (int(claims["sub"]), claims["ws"]),
    ).fetchone()
    if row is None:  # user or membership was removed after the token was issued
        raise unauthorised
    return Principal(row["id"], row["workspace_id"], row["role"], row["name"], row["email"])


def require_role(*roles: str):
    """Dependency factory: allow only the listed roles."""

    def check(principal: Principal = Depends(current_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role cannot do this")
        return principal

    return check


# Admins do everything; managers run the pipeline, review and publish; viewers read.
can_write = require_role("admin", "manager")
admin_only = require_role("admin")

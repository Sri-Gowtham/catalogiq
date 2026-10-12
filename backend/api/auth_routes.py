from typing import Literal

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi.security import HTTPBearer
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

import config
from auth.deps import Principal, current_principal
from auth.security import EMAIL_RE, clear_session_cookie, create_token, hash_password, hash_reset_token, login_limiter, reset_limiter, set_session_cookie, verify_password
from db.core import audit, get_db, now

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=160)
    password: str = Field(min_length=8, max_length=128)
    company: str = Field(min_length=2, max_length=120)
    industry: str | None = Field(default=None, max_length=60)
    sku_range: str | None = Field(default=None, max_length=30)


class LoginIn(BaseModel):
    email: str = Field(max_length=160)
    password: str = Field(max_length=128)


class MeOut(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    workspace_id: int
    workspace_name: str
    is_demo: bool
    onboarded: bool
    plan: str


class TokenOut(BaseModel):
    token: str
    me: MeOut


def _me(db, principal: Principal) -> MeOut:
    ws = db.execute("SELECT name, is_demo, onboarded, plan FROM workspaces WHERE id = ?", (principal.workspace_id,)).fetchone()
    return MeOut(user_id=principal.user_id, name=principal.name, email=principal.email, role=principal.role, workspace_id=principal.workspace_id,
                 workspace_name=ws["name"], is_demo=bool(ws["is_demo"]), onboarded=bool(ws["onboarded"]), plan=ws["plan"])


def _issue(db, user_id: int, response: Response) -> TokenOut:
    m = db.execute("SELECT m.workspace_id, m.role, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.id = ? ORDER BY m.id LIMIT 1", (user_id,)).fetchone()
    if m is None:
        raise HTTPException(403, "This account is not a member of any workspace.")
    principal = Principal(user_id, m["workspace_id"], m["role"], m["name"], m["email"])
    token = create_token(user_id, m["workspace_id"], m["role"])
    set_session_cookie(response, token)  # the web app relies on this cookie; the token in the body is for scripts and API clients
    return TokenOut(token=token, me=_me(db, principal))


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, response: Response, db=Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address")
    if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    ts = now()
    uid = db.execute("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)", (email, body.name.strip(), hash_password(body.password), ts)).lastrowid
    wid = db.execute("INSERT INTO workspaces (name, industry, sku_range, plan, created_at) VALUES (?, ?, ?, 'trial', ?)",
                     (body.company.strip(), body.industry, body.sku_range, ts)).lastrowid
    db.execute("INSERT INTO memberships (workspace_id, user_id, role) VALUES (?, ?, 'admin')", (wid, uid))
    audit(db, wid, uid, "Created workspace", body.company.strip())
    return _issue(db, uid, response)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, response: Response, db=Depends(get_db)):
    email = body.email.strip().lower()
    key = f"{email}|{request.client.host if request.client else 'unknown'}"
    if not login_limiter.allow(key, config.LOGIN_ATTEMPTS_PER_MINUTE):
        raise HTTPException(429, "Too many sign-in attempts. Wait a minute and try again.")
    row = db.execute("SELECT id, password_hash FROM users WHERE email = ?", (email,)).fetchone()
    # verify against a dummy hash when the user is unknown so timing does not reveal which emails exist
    ok = verify_password(body.password, row["password_hash"] if row else "scrypt$00$00")
    if not row or not ok:
        raise HTTPException(401, "Email or password is incorrect")
    return _issue(db, row["id"], response)


DEMO_USERS = {"admin": config.DEMO_EMAIL, "manager": "manager@acmefoods.example", "viewer": "viewer@acmefoods.example"}


@router.post("/demo", response_model=TokenOut)
def demo_login(response: Response, role: Literal["admin", "manager", "viewer"] = "admin", db=Depends(get_db)):
    """One-click sign-in to the fictional Acme Foods demo workspace, as any of its three roles."""
    row = db.execute("SELECT id FROM users WHERE email = ?", (DEMO_USERS[role],)).fetchone()
    if not row:
        raise HTTPException(503, "The demo workspace is not available")
    return _issue(db, row["id"], response)


@router.get("/session", response_model=MeOut | None)
def session_state(request: Request, creds=Depends(HTTPBearer(auto_error=False)), db=Depends(get_db)):
    """Who is signed in, or null. Always 200, so the web app can check on every page load without a failed request."""
    try:
        principal = current_principal(request, creds, db)
    except HTTPException:
        return None
    return _me(db, principal)


@router.get("/me", response_model=MeOut)
def me(principal: Principal = Depends(current_principal), db=Depends(get_db)):
    return _me(db, principal)


@router.post("/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


log = logging.getLogger("catalogiq")


class ForgotIn(BaseModel):
    email: str = Field(max_length=160)


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


@router.post("/forgot")
def forgot_password(body: ForgotIn, request: Request, db=Depends(get_db)):
    """Always answers the same way, so it cannot be used to find out which emails have accounts.

    Email delivery is not built: the link is written to the server log. Only with CATALOGIQ_DEV_RESET_LINKS=1
    (local demos) is it also returned in the response.
    """
    if not reset_limiter.allow(f"forgot|{request.client.host if request.client else 'unknown'}", config.RESET_ATTEMPTS_PER_MINUTE):
        raise HTTPException(429, "Too many requests. Wait a minute and try again.")
    reply: dict = {"ok": True, "message": "If that email has an account, a reset link has been sent."}
    user = db.execute("SELECT id FROM users WHERE email = ?", (body.email.strip().lower(),)).fetchone()
    if user:
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(minutes=config.RESET_TTL_MINUTES)).isoformat(timespec="seconds")
        db.execute("DELETE FROM password_resets WHERE user_id = ?", (user["id"],))
        db.execute("INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)", (user["id"], hash_reset_token(token), expires, now()))
        link = f"/reset-password?token={token}"
        log.warning("Password reset link for %s (valid %d minutes): %s", body.email.strip().lower(), config.RESET_TTL_MINUTES, link)
        if config.DEV_RESET_LINKS:
            reply["reset_link"] = link
    return reply


@router.post("/reset")
def reset_password(body: ResetIn, request: Request, db=Depends(get_db)):
    if not reset_limiter.allow(f"reset|{request.client.host if request.client else 'unknown'}", config.RESET_ATTEMPTS_PER_MINUTE * 2):
        raise HTTPException(429, "Too many attempts. Wait a minute and try again.")
    row = db.execute("SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > ?", (hash_reset_token(body.token), now())).fetchone()
    if row is None:
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(body.password), row["user_id"]))
    db.execute("DELETE FROM password_resets WHERE user_id = ?", (row["user_id"],))
    return {"ok": True}

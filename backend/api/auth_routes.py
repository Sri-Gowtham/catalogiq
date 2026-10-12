from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

import config
from auth.deps import Principal, current_principal
from auth.security import EMAIL_RE, create_token, hash_password, login_limiter, verify_password
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


def _issue(db, user_id: int) -> TokenOut:
    m = db.execute("SELECT m.workspace_id, m.role, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.id = ? ORDER BY m.id LIMIT 1", (user_id,)).fetchone()
    if m is None:
        raise HTTPException(403, "This account is not a member of any workspace.")
    principal = Principal(user_id, m["workspace_id"], m["role"], m["name"], m["email"])
    return TokenOut(token=create_token(user_id, m["workspace_id"], m["role"]), me=_me(db, principal))


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, db=Depends(get_db)):
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
    return _issue(db, uid)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db=Depends(get_db)):
    email = body.email.strip().lower()
    key = f"{email}|{request.client.host if request.client else 'unknown'}"
    if not login_limiter.allow(key, config.LOGIN_ATTEMPTS_PER_MINUTE):
        raise HTTPException(429, "Too many sign-in attempts. Wait a minute and try again.")
    row = db.execute("SELECT id, password_hash FROM users WHERE email = ?", (email,)).fetchone()
    # verify against a dummy hash when the user is unknown so timing does not reveal which emails exist
    ok = verify_password(body.password, row["password_hash"] if row else "scrypt$00$00")
    if not row or not ok:
        raise HTTPException(401, "Email or password is incorrect")
    return _issue(db, row["id"])


DEMO_USERS = {"admin": config.DEMO_EMAIL, "manager": "manager@acmefoods.example", "viewer": "viewer@acmefoods.example"}


@router.post("/demo", response_model=TokenOut)
def demo_login(role: Literal["admin", "manager", "viewer"] = "admin", db=Depends(get_db)):
    """One-click sign-in to the fictional Acme Foods demo workspace, as any of its three roles."""
    row = db.execute("SELECT id FROM users WHERE email = ?", (DEMO_USERS[role],)).fetchone()
    if not row:
        raise HTTPException(503, "The demo workspace is not available")
    return _issue(db, row["id"])


@router.get("/me", response_model=MeOut)
def me(principal: Principal = Depends(current_principal), db=Depends(get_db)):
    return _me(db, principal)

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

import config
from auth.security import EMAIL_RE, contact_limiter
from db.core import get_db, now

router = APIRouter(prefix="/api", tags=["public"])


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=160)
    sku_range: str | None = Field(default=None, max_length=30)
    message: str | None = Field(default=None, max_length=1000)


@router.post("/contact", status_code=201)
def contact(body: ContactIn, request: Request, db=Depends(get_db)):
    """Stores a demo request. Nobody is emailed in this prototype, and there is no read endpoint either."""
    if not contact_limiter.allow(f"contact|{request.client.host if request.client else 'unknown'}", config.CONTACT_PER_MINUTE):
        raise HTTPException(429, "Too many requests. Try again in a minute.")
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address")
    db.execute("INSERT INTO leads (name, email, sku_range, message, created_at) VALUES (?, ?, ?, ?, ?)", (body.name.strip(), email, body.sku_range, body.message, now()))
    return {"ok": True}

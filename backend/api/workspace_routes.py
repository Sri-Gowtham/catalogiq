import secrets
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth.deps import Principal, admin_only, can_write, current_principal
from auth.security import EMAIL_RE, hash_password
from db.core import audit, get_db, now
from seed.demo import seed_workspace
from workbench.importer import sync_live_batches

router = APIRouter(prefix="/api", tags=["workspace"])


class OnboardingIn(BaseModel):
    platforms: list[str] = Field(default_factory=list)
    load_demo_data: bool = False


@router.post("/workspace/onboarding")
def onboarding(body: OnboardingIn, p: Principal = Depends(admin_only), db=Depends(get_db)):
    has_products = db.execute("SELECT 1 FROM products WHERE workspace_id = ? LIMIT 1", (p.workspace_id,)).fetchone()
    if body.load_demo_data and not has_products:
        seed_workspace(db, p.workspace_id)  # marks the workspace as demo data and onboarded
        audit(db, p.workspace_id, p.user_id, "Loaded demo data", "Acme Foods sample catalog")
    else:
        from seed.catalog_data import PLATFORMS
        from db.core import dumps, now

        for plat in PLATFORMS:
            if plat["key"] in body.platforms and not db.execute("SELECT 1 FROM platforms WHERE workspace_id = ? AND key = ?", (p.workspace_id, plat["key"])).fetchone():
                db.execute("INSERT INTO platforms (workspace_id, key, name, kind, region, status, connected_at, rules) VALUES (?, ?, ?, ?, ?, 'connected', ?, ?)",
                           (p.workspace_id, plat["key"], plat["name"], plat["kind"], plat["region"], now(), dumps(plat["rules"])))
        db.execute("UPDATE workspaces SET onboarded = 1 WHERE id = ?", (p.workspace_id,))
    return {"ok": True, "demo_data": bool(body.load_demo_data and not has_products)}


@router.get("/overview")
def overview(p: Principal = Depends(current_principal), db=Depends(get_db)):
    ws = p.workspace_id
    sync_live_batches(db, ws)
    one = lambda sql, *a: db.execute(sql, a).fetchone()
    status = {r["status"]: r["n"] for r in db.execute("SELECT status, COUNT(*) AS n FROM products WHERE workspace_id = ? GROUP BY status", (ws,)).fetchall()}
    total = sum(status.values())
    scored = one("SELECT COUNT(*) AS n, AVG(quality_score) AS avg, SUM(quality_score >= 70) AS passed FROM products WHERE workspace_id = ? AND quality_score IS NOT NULL", ws)
    audit_pass = one("SELECT COUNT(*) AS n FROM products WHERE workspace_id = ? AND (audit_status IS NULL OR audit_status != 'FLAGGED')", ws)["n"]
    cleared = one("SELECT COUNT(*) AS n FROM products WHERE workspace_id = ? AND status IN ('ready', 'live', 'upcoming')", ws)["n"]

    today = date.today()
    perf = db.execute(
        "SELECT d.day, SUM(d.impressions) AS impressions, SUM(d.clicks) AS clicks, SUM(d.orders) AS orders, SUM(d.revenue) AS revenue FROM performance_daily d "
        "JOIN listings l ON l.id = d.listing_id JOIN products p ON p.id = l.product_id WHERE p.workspace_id = ? GROUP BY d.day ORDER BY d.day", (ws,)).fetchall()
    series = [dict(day=r["day"], clicks=r["clicks"], orders=r["orders"], revenue=round(r["revenue"], 2)) for r in perf]
    tot = lambda k, rows: sum(r[k] for r in rows)
    last7, prev7 = perf[-7:], perf[-14:-7]
    revenue_delta = round((tot("revenue", last7) - tot("revenue", prev7)) / tot("revenue", prev7) * 100, 1) if prev7 and tot("revenue", prev7) else None

    platforms = db.execute(
        "SELECT pl.key, pl.name, pl.status, "
        "SUM(CASE WHEN l.status = 'live' THEN 1 ELSE 0 END) AS live, SUM(CASE WHEN l.status = 'queued' THEN 1 ELSE 0 END) AS queued, SUM(CASE WHEN l.status = 'suppressed' THEN 1 ELSE 0 END) AS suppressed "
        "FROM platforms pl LEFT JOIN listings l ON l.platform_key = pl.key AND l.product_id IN (SELECT id FROM products WHERE workspace_id = ?) WHERE pl.workspace_id = ? GROUP BY pl.id ORDER BY pl.id", (ws, ws)).fetchall()

    def movers(order):
        return [dict(product_id=r["product_id"], name=r["name"], platform=r["platform_key"], rank=r["rank"], rank_prev=r["rank_prev"], change=r["rank_prev"] - r["rank"])
                for r in db.execute(
                    "SELECT l.product_id, p.name, l.platform_key, l.rank, l.rank_prev FROM listings l JOIN products p ON p.id = l.product_id "
                    f"WHERE p.workspace_id = ? AND l.status = 'live' AND l.rank IS NOT NULL AND l.rank_prev IS NOT NULL ORDER BY (l.rank_prev - l.rank) {order} LIMIT 5", (ws,)).fetchall()]

    pending = one("SELECT COUNT(*) AS n FROM review_items WHERE workspace_id = ? AND status = 'pending'", ws)["n"]
    suppressed = one("SELECT COUNT(*) AS n FROM listings l JOIN products p ON p.id = l.product_id WHERE p.workspace_id = ? AND l.status = 'suppressed'", ws)["n"]
    under = one("SELECT COUNT(*) AS n FROM listings l JOIN products p ON p.id = l.product_id WHERE p.workspace_id = ? AND l.flag = 'flag'", ws)["n"]
    watching = one("SELECT COUNT(*) AS n FROM listings l JOIN products p ON p.id = l.product_id WHERE p.workspace_id = ? AND l.flag = 'watch'", ws)["n"]
    attention_platforms = [r["name"] for r in platforms if r["status"] == "attention"]
    running = one("SELECT COUNT(*) AS n FROM batches WHERE workspace_id = ? AND status IN ('queued', 'running')", ws)["n"]
    attention = [a for a in [
        dict(kind="review", level="high", text=f"{pending} products wait for review", href="/app/review") if pending else None,
        dict(kind="suppressed", level="high", text=f"{suppressed} listings are suppressed", href="/app/performance?tab=flagged") if suppressed else None,
        dict(kind="underperforming", level="medium", text=f"{under} listings are underperforming", href="/app/performance?tab=flagged") if under else None,
        dict(kind="watch", level="low", text=f"{watching} listings are slipping in rank", href="/app/performance?tab=flagged") if watching else None,
        dict(kind="platform", level="medium", text=f"{', '.join(attention_platforms)} needs attention", href="/app/platforms") if attention_platforms else None,
        dict(kind="batches", level="low", text=f"{running} batches are in progress", href="/app/batches") if running else None,
    ] if a]

    upcoming = [dict(id=r["id"], sku=r["sku"], name=r["name"], launch_date=r["launch_date"], quality_score=r["quality_score"]) for r in db.execute(
        "SELECT id, sku, name, launch_date, quality_score FROM products WHERE workspace_id = ? AND status = 'upcoming' ORDER BY launch_date LIMIT 6", (ws,)).fetchall()]
    in_week = one("SELECT COUNT(*) AS n FROM products WHERE workspace_id = ? AND status = 'upcoming' AND launch_date <= ?", ws, (today + timedelta(days=7)).isoformat())["n"]
    batches = [dict(id=r["id"], name=r["name"], status=r["status"], stage=r["stage"], total=r["total"], flagged=r["flagged"], kind=r["kind"]) for r in db.execute(
        "SELECT * FROM batches WHERE workspace_id = ? ORDER BY id DESC LIMIT 4", (ws,)).fetchall()]
    activity = [dict(action=r["action"], entity=r["entity"], detail=r["detail"], at=r["created_at"], user=r["user"]) for r in db.execute(
        "SELECT a.*, u.name AS user FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.workspace_id = ? ORDER BY a.id DESC LIMIT 8", (ws,)).fetchall()]
    w = one("SELECT name, is_demo, plan FROM workspaces WHERE id = ?", ws)
    return dict(
        workspace=dict(name=w["name"], is_demo=bool(w["is_demo"]), plan=w["plan"]),
        counts=dict(total=total, live=status.get("live", 0), in_enrichment=status.get("in_enrichment", 0), flagged=status.get("flagged", 0), ready=status.get("ready", 0),
                    upcoming=status.get("upcoming", 0), launching_this_week=in_week),
        health=dict(avg_quality=round(scored["avg"], 1) if scored["avg"] else None, gate_pass_rate=round(100 * scored["passed"] / scored["n"], 1) if scored["n"] else None, scored=scored["n"]),
        funnel=[dict(stage="In catalog", count=total), dict(stage="Passed data audit", count=audit_pass), dict(stage="Cleared quality gate", count=cleared), dict(stage="Live on a platform", count=status.get("live", 0))],
        platforms=[dict(r) for r in platforms],
        performance=dict(days=len(perf), impressions=tot("impressions", perf), clicks=tot("clicks", perf), orders=tot("orders", perf), revenue=round(tot("revenue", perf), 2),
                         ctr=round(100 * tot("clicks", perf) / tot("impressions", perf), 2) if perf and tot("impressions", perf) else None,
                         conversion=round(100 * tot("orders", perf) / tot("clicks", perf), 2) if perf and tot("clicks", perf) else None, revenue_delta_pct=revenue_delta),
        series=series, movers=dict(up=movers("DESC"), down=movers("ASC")), attention=attention, upcoming=upcoming, batches=batches, activity=activity,
    )


@router.get("/notifications")
def notifications(p: Principal = Depends(current_principal), db=Depends(get_db)):
    rows = db.execute("SELECT * FROM notifications WHERE workspace_id = ? ORDER BY id DESC LIMIT 20", (p.workspace_id,)).fetchall()
    return [dict(id=r["id"], text=r["text"], level=r["level"], read=bool(r["read"]), created_at=r["created_at"]) for r in rows]


@router.post("/notifications/read")
def mark_read(p: Principal = Depends(current_principal), db=Depends(get_db)):
    db.execute("UPDATE notifications SET read = 1 WHERE workspace_id = ?", (p.workspace_id,))
    return {"ok": True}


@router.get("/team")
def team(p: Principal = Depends(current_principal), db=Depends(get_db)):
    rows = db.execute("SELECT u.id, u.name, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.id", (p.workspace_id,)).fetchall()
    return [dict(id=r["id"], name=r["name"], email=r["email"], role=r["role"]) for r in rows]


class InviteIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=160)
    role: Literal["admin", "manager", "viewer"]


class RoleIn(BaseModel):
    role: Literal["admin", "manager", "viewer"]


@router.post("/team", status_code=201)
def invite(body: InviteIn, p: Principal = Depends(admin_only), db=Depends(get_db)):
    """Add a teammate. Email delivery is not built, so the response returns a one-time password to share."""
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address")
    if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        raise HTTPException(409, "This email already has an account.")
    temp = "Temp-" + secrets.token_urlsafe(6)
    uid = db.execute("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)", (email, body.name.strip(), hash_password(temp), now())).lastrowid
    db.execute("INSERT INTO memberships (workspace_id, user_id, role) VALUES (?, ?, ?)", (p.workspace_id, uid, body.role))
    audit(db, p.workspace_id, p.user_id, "Invited teammate", email, body.role)
    return {"id": uid, "temporary_password": temp}


@router.patch("/team/{user_id}")
def change_role(user_id: int, body: RoleIn, p: Principal = Depends(admin_only), db=Depends(get_db)):
    if user_id == p.user_id:
        raise HTTPException(409, "You cannot change your own role.")
    cur = db.execute("UPDATE memberships SET role = ? WHERE workspace_id = ? AND user_id = ?", (body.role, p.workspace_id, user_id))
    if cur.rowcount == 0:
        raise HTTPException(404, "Member not found")
    audit(db, p.workspace_id, p.user_id, "Changed role", str(user_id), body.role)
    return {"ok": True}


@router.delete("/team/{user_id}")
def remove_member(user_id: int, p: Principal = Depends(admin_only), db=Depends(get_db)):
    if user_id == p.user_id:
        raise HTTPException(409, "You cannot remove yourself.")
    cur = db.execute("DELETE FROM memberships WHERE workspace_id = ? AND user_id = ?", (p.workspace_id, user_id))
    if cur.rowcount == 0:
        raise HTTPException(404, "Member not found")
    audit(db, p.workspace_id, p.user_id, "Removed teammate", str(user_id))
    return {"ok": True}


@router.get("/audit-log")
def audit_log(p: Principal = Depends(can_write), db=Depends(get_db)):
    rows = db.execute("SELECT a.*, u.name AS user FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.workspace_id = ? ORDER BY a.id DESC LIMIT 100", (p.workspace_id,)).fetchall()
    return [dict(id=r["id"], action=r["action"], entity=r["entity"], detail=r["detail"], user=r["user"], at=r["created_at"]) for r in rows]


@router.get("/workspace")
def workspace(p: Principal = Depends(current_principal), db=Depends(get_db)):
    r = db.execute("SELECT * FROM workspaces WHERE id = ?", (p.workspace_id,)).fetchone()
    if r is None:
        raise HTTPException(404, "Workspace not found")
    return dict(id=r["id"], name=r["name"], industry=r["industry"], sku_range=r["sku_range"], plan=r["plan"], is_demo=bool(r["is_demo"]), onboarded=bool(r["onboarded"]))

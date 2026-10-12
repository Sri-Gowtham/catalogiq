import re
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth.deps import Principal, admin_only, can_write, current_principal
from db.core import audit, get_db, now
from pipeline.registry import AGENTS
from workbench import get_workbench

router = APIRouter(prefix="/api", tags=["insights"])

LISTING_BASE = (
    "SELECT l.id, l.platform_key, pl.name AS platform_name, l.rank, l.rank_prev, l.flag, l.diagnosis, l.status, p.id AS product_id, p.sku, p.name, p.category, "
    "SUM(d.impressions) AS imps, SUM(d.clicks) AS clicks, SUM(d.orders) AS orders, SUM(d.revenue) AS revenue, SUM(d.returns) AS returns "
    "FROM listings l JOIN products p ON p.id = l.product_id JOIN platforms pl ON pl.key = l.platform_key AND pl.workspace_id = p.workspace_id "
    "LEFT JOIN performance_daily d ON d.listing_id = l.id AND d.day >= ? WHERE p.workspace_id = ? AND l.status != 'queued' "
)


def _since(days: int) -> str:
    return (date.today() - timedelta(days=days - 1)).isoformat()


def _pct(a, b):
    return round(100 * a / b, 2) if b else None


@router.get("/performance/summary")
def performance_summary(days: int = Query(30, ge=7, le=30), platform: str | None = None, category: str | None = None,
                        p: Principal = Depends(current_principal), db=Depends(get_db)):
    extra, args = "", [_since(days), p.workspace_id]
    if platform:
        extra += " AND l.platform_key = ?"
        args.append(platform)
    if category:
        extra += " AND p.category = ?"
        args.append(category)
    base = ("FROM performance_daily d JOIN listings l ON l.id = d.listing_id JOIN products p ON p.id = l.product_id "
            f"WHERE d.day >= ? AND p.workspace_id = ?{extra}")
    series = db.execute(f"SELECT d.day, SUM(d.impressions) AS impressions, SUM(d.clicks) AS clicks, SUM(d.orders) AS orders, SUM(d.revenue) AS revenue, AVG(d.rank) AS rank {base} GROUP BY d.day ORDER BY d.day", args).fetchall()
    t = db.execute(f"SELECT COALESCE(SUM(d.impressions), 0) AS imps, COALESCE(SUM(d.clicks), 0) AS clicks, COALESCE(SUM(d.orders), 0) AS orders, COALESCE(SUM(d.revenue), 0) AS revenue, COALESCE(SUM(d.returns), 0) AS returns, AVG(d.rank) AS rank {base}", args).fetchone()
    by_platform = db.execute(f"SELECT l.platform_key AS key, SUM(d.clicks) AS clicks, SUM(d.orders) AS orders, SUM(d.revenue) AS revenue, AVG(d.rank) AS rank {base} GROUP BY l.platform_key", args).fetchall()
    by_category = db.execute(f"SELECT p.category AS key, SUM(d.clicks) AS clicks, SUM(d.orders) AS orders, SUM(d.revenue) AS revenue, AVG(d.rank) AS rank {base} GROUP BY p.category ORDER BY revenue DESC", args).fetchall()
    return dict(
        days=days, impressions=t["imps"], clicks=t["clicks"], orders=t["orders"], revenue=round(t["revenue"], 2), ctr=_pct(t["clicks"], t["imps"]), conversion=_pct(t["orders"], t["clicks"]),
        return_rate=_pct(t["returns"], t["orders"]), avg_rank=round(t["rank"], 1) if t["rank"] else None,
        series=[dict(day=r["day"], impressions=r["impressions"], clicks=r["clicks"], orders=r["orders"], revenue=round(r["revenue"], 2), rank=round(r["rank"], 1)) for r in series],
        by_platform=[dict(key=r["key"], clicks=r["clicks"], orders=r["orders"], revenue=round(r["revenue"], 2), avg_rank=round(r["rank"], 1)) for r in by_platform],
        by_category=[dict(key=r["key"], clicks=r["clicks"], orders=r["orders"], revenue=round(r["revenue"], 2), avg_rank=round(r["rank"], 1)) for r in by_category],
    )


@router.get("/performance/listings")
def performance_listings(view: Literal["top", "bottom", "flagged", "movers_down", "movers_up"] = "top", platform: str | None = None, limit: int = Query(20, ge=1, le=100),
                         p: Principal = Depends(current_principal), db=Depends(get_db)):
    where, args = "", [_since(30), p.workspace_id]
    if platform:
        where += " AND l.platform_key = ?"
        args.append(platform)
    if view == "flagged":
        where += " AND l.flag IN ('flag', 'watch')"
    order = {"top": "revenue DESC", "bottom": "revenue ASC", "flagged": "CASE l.flag WHEN 'flag' THEN 0 ELSE 1 END, l.rank DESC",
             "movers_down": "(l.rank - l.rank_prev) DESC", "movers_up": "(l.rank - l.rank_prev) ASC"}[view]
    rows = db.execute(f"{LISTING_BASE}{where} GROUP BY l.id ORDER BY {order} LIMIT ?", args + [limit]).fetchall()
    return [dict(listing_id=r["id"], product_id=r["product_id"], sku=r["sku"], name=r["name"], category=r["category"], platform_key=r["platform_key"], platform_name=r["platform_name"],
                 status=r["status"], rank=r["rank"], rank_prev=r["rank_prev"], flag=r["flag"], diagnosis=r["diagnosis"], clicks=r["clicks"] or 0, orders=r["orders"] or 0,
                 revenue=round(r["revenue"] or 0, 2), ctr=_pct(r["clicks"] or 0, r["imps"] or 0), conversion=_pct(r["orders"] or 0, r["clicks"] or 0)) for r in rows]


@router.get("/performance/ab-tests")
def ab_tests(p: Principal = Depends(current_principal), db=Depends(get_db)):
    rows = db.execute(
        "SELECT t.*, l.platform_key, pr.id AS product_id, pr.sku, pr.name FROM ab_tests t JOIN listings l ON l.id = t.listing_id JOIN products pr ON pr.id = l.product_id "
        "WHERE pr.workspace_id = ? ORDER BY t.id DESC", (p.workspace_id,)).fetchall()
    return [dict(id=r["id"], listing_id=r["listing_id"], product_id=r["product_id"], sku=r["sku"], name=r["name"], platform_key=r["platform_key"], variant_a=r["variant_a"], variant_b=r["variant_b"],
                 status=r["status"], winner=r["winner"], uplift_pct=r["uplift_pct"], started_at=r["started_at"]) for r in rows]


@router.post("/listings/{listing_id}/reoptimize")
def reoptimize(listing_id: int, p: Principal = Depends(can_write), db=Depends(get_db)):
    """Start a (simulated) fix-and-test for an underperforming listing."""
    l = db.execute("SELECT l.id, l.product_id, l.platform_key, pc.title FROM listings l JOIN products pr ON pr.id = l.product_id "
                   "JOIN product_content pc ON pc.product_id = l.product_id AND pc.platform_key = l.platform_key WHERE l.id = ? AND pr.workspace_id = ?", (listing_id, p.workspace_id)).fetchone()
    if l is None:
        raise HTTPException(404, "Listing not found")
    if db.execute("SELECT 1 FROM ab_tests WHERE listing_id = ? AND status = 'running'", (listing_id,)).fetchone():
        raise HTTPException(409, "A test is already running for this listing.")
    variant = l["title"] + " | Best seller" if " | " not in l["title"] else l["title"].replace(" | ", " | Best seller | ", 1)
    db.execute("INSERT INTO ab_tests (listing_id, variant_a, variant_b, status, started_at) VALUES (?, ?, ?, 'running', ?)", (listing_id, l["title"], variant, date.today().isoformat()))
    audit(db, p.workspace_id, p.user_id, "Started A/B test", f"listing {listing_id}", "Simulated: no marketplace experiment API was called.")
    return {"ok": True}


# ----------------------------------------------------------------- brand rulebook
class RuleIn(BaseModel):
    region: Literal["ALL", "IN", "AE", "US"]
    kind: Literal["restricted_claim", "mandatory_claim", "trademark", "allergen_format"]
    value: str = Field(min_length=2, max_length=200)
    note: str | None = Field(default=None, max_length=200)


class RuleTestIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    region: Literal["ALL", "IN", "AE", "US"] = "ALL"


@router.get("/rules")
def list_rules(p: Principal = Depends(can_write), db=Depends(get_db)):
    rows = db.execute("SELECT * FROM rules WHERE workspace_id = ? ORDER BY region, kind, id", (p.workspace_id,)).fetchall()
    return [dict(id=r["id"], region=r["region"], kind=r["kind"], value=r["value"], note=r["note"]) for r in rows]


@router.post("/rules", status_code=201)
def add_rule(body: RuleIn, p: Principal = Depends(admin_only), db=Depends(get_db)):
    rid = db.execute("INSERT INTO rules (workspace_id, region, kind, value, note) VALUES (?, ?, ?, ?, ?)", (p.workspace_id, body.region, body.kind, body.value.strip(), body.note)).lastrowid
    audit(db, p.workspace_id, p.user_id, "Added rule", body.kind, body.value)
    return {"id": rid}


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, p: Principal = Depends(admin_only), db=Depends(get_db)):
    cur = db.execute("DELETE FROM rules WHERE id = ? AND workspace_id = ?", (rule_id, p.workspace_id))
    if cur.rowcount == 0:
        raise HTTPException(404, "Rule not found")
    audit(db, p.workspace_id, p.user_id, "Deleted rule", str(rule_id))
    return {"ok": True}


@router.post("/rules/test")
def test_rules(body: RuleTestIn, p: Principal = Depends(can_write), db=Depends(get_db)):
    """Check a piece of copy against the workspace's restricted-claim and trademark rules for a region."""
    rules = db.execute("SELECT * FROM rules WHERE workspace_id = ? AND region IN ('ALL', ?)", (p.workspace_id, body.region)).fetchall()
    findings = []
    for r in rules:
        if r["kind"] == "restricted_claim":
            for m in re.finditer(rf"\b{re.escape(r['value'])}\b", body.text, re.I):
                findings.append(dict(rule_id=r["id"], kind=r["kind"], severity="high", match=m.group(0), start=m.start(), end=m.end(), message=f"Restricted claim: {r['note'] or r['value']}"))
        elif r["kind"] == "trademark" and r["note"] and r["note"].lower().startswith("write as "):
            correct = r["note"][9:].strip()
            for m in re.finditer(rf"\b{re.escape(r['value'])}\b", body.text, re.I):
                if m.group(0) != correct:
                    findings.append(dict(rule_id=r["id"], kind=r["kind"], severity="medium", match=m.group(0), start=m.start(), end=m.end(), message=f"Trademark format: write as {correct}"))
    findings.sort(key=lambda f: f["start"])
    return dict(passed=not any(f["severity"] == "high" for f in findings), findings=findings, rules_checked=len(rules))


# ----------------------------------------------------------------- agent workbench
@router.get("/workbench")
def workbench(p: Principal = Depends(can_write), db=Depends(get_db)):
    wb = get_workbench()
    agents = []
    for a in AGENTS:
        s = db.execute(
            "SELECT COUNT(*) AS runs, AVG(CASE WHEN status = 'done' THEN duration_ms END) AS avg_ms, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed, "
            "SUM(CASE WHEN status = 'done' THEN processed ELSE 0 END) AS processed, SUM(tokens) AS tokens FROM agent_runs WHERE workspace_id = ? AND agent_id = ? AND status != 'pending'", (p.workspace_id, a.id)).fetchone()
        agents.append(dict(id=a.id, name=a.name, layer=a.layer, mode=a.mode, description=a.description, in_pipeline=a.in_pipeline, runs=s["runs"], avg_ms=round(s["avg_ms"]) if s["avg_ms"] else None,
                           failed=s["failed"] or 0, processed=s["processed"] or 0, tokens=s["tokens"]))
    recent = db.execute(
        "SELECT r.*, b.name AS batch_name FROM agent_runs r LEFT JOIN batches b ON b.id = r.batch_id WHERE r.workspace_id = ? AND r.status != 'pending' ORDER BY r.id DESC LIMIT 25", (p.workspace_id,)).fetchall()
    names = {a.id: a.name for a in AGENTS}
    return dict(
        connection=dict(name=wb.name, endpoint=wb.endpoint, **wb.health()), agents=agents,
        recent_runs=[dict(id=r["id"], agent_id=r["agent_id"], agent_name=names.get(r["agent_id"], r["agent_id"]), mode=r["mode"], status=r["status"], batch=r["batch_name"], duration_ms=r["duration_ms"],
                          processed=r["processed"], tokens=r["tokens"], note=r["note"]) for r in recent],
    )


# ----------------------------------------------------------------- reports
@router.get("/reports/summary")
def reports_summary(p: Principal = Depends(current_principal), db=Depends(get_db)):
    """Time and cost saved. These are *estimates* from stated assumptions, not measured results."""
    processed = db.execute("SELECT COUNT(*) AS n FROM products WHERE workspace_id = ? AND status != 'draft'", (p.workspace_id,)).fetchone()["n"]
    flagged = db.execute("SELECT COUNT(*) AS n FROM products WHERE workspace_id = ? AND status = 'flagged'", (p.workspace_id,)).fetchone()["n"]
    minutes_each, cost_per_hour = 20, 350
    hours = round(processed * minutes_each / 60, 1)
    by_cat = db.execute("SELECT category, COUNT(*) AS n, AVG(quality_score) AS q FROM products WHERE workspace_id = ? AND category IS NOT NULL GROUP BY category ORDER BY n DESC", (p.workspace_id,)).fetchall()
    return dict(
        products_processed=processed, flagged_early=flagged, hours_saved_estimate=hours, cost_saved_estimate=round(hours * cost_per_hour),
        assumptions=[f"Manual enrichment takes about {minutes_each} minutes per product (team estimate).", f"A content team costs about ₹{cost_per_hour} per hour (assumption).",
                     "Flagged products were stopped before any AI effort was spent on them."],
        categories=[dict(category=r["category"], products=r["n"], avg_quality=round(r["q"], 1) if r["q"] else None) for r in by_cat],
    )

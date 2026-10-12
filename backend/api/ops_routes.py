from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

import config
from auth.deps import Principal, admin_only, can_write, current_principal
from db.core import audit, get_db, loads, now
from pipeline.registry import AGENTS, pipeline_agents
from workbench.importer import start_feed_run, sync_live_batches

router = APIRouter(prefix="/api", tags=["operations"])
AGENT_NAMES = {a.id: a.name for a in AGENTS}


# ----------------------------------------------------------------- batches
def _batch(r, progress_total: int) -> dict:
    return dict(id=r["id"], name=r["name"], source_file=r["source_file"], kind=r["kind"], status=r["status"], stage=r["stage"], stage_name=AGENT_NAMES.get(r["stage"], r["stage"]),
                stage_index=r["stage_index"], stage_total=progress_total, total=r["total"], flagged=r["flagged"], ready=r["ready"], created_at=r["created_at"],
                finished_at=r["finished_at"], error=r["error"], job_id=r["job_id"])


@router.get("/batches")
def list_batches(p: Principal = Depends(current_principal), db=Depends(get_db)):
    sync_live_batches(db, p.workspace_id)
    n = len(pipeline_agents())
    return [_batch(r, n) for r in db.execute("SELECT * FROM batches WHERE workspace_id = ? ORDER BY id DESC", (p.workspace_id,)).fetchall()]


@router.get("/batches/{batch_id}")
def batch_detail(batch_id: int, p: Principal = Depends(current_principal), db=Depends(get_db)):
    sync_live_batches(db, p.workspace_id)
    r = db.execute("SELECT * FROM batches WHERE id = ? AND workspace_id = ?", (batch_id, p.workspace_id)).fetchone()
    if r is None:
        raise HTTPException(404, "Batch not found")
    runs = db.execute("SELECT * FROM agent_runs WHERE batch_id = ? ORDER BY id", (batch_id,)).fetchall()
    by_status = {x["status"]: x["n"] for x in db.execute("SELECT status, COUNT(*) AS n FROM products WHERE batch_id = ? GROUP BY status", (batch_id,)).fetchall()}
    layer = {a.id: a.layer for a in AGENTS}
    return dict(
        batch=_batch(r, len(pipeline_agents())),
        stages=[dict(agent_id=x["agent_id"], name=AGENT_NAMES.get(x["agent_id"], x["agent_id"]), layer=layer.get(x["agent_id"], 2), mode=x["mode"], status=x["status"], duration_ms=x["duration_ms"],
                     processed=x["processed"], skipped=x["skipped"], tokens=x["tokens"], note=x["note"]) for x in runs],
        product_status=by_status,
    )


def _check_upload(name: str, data: bytes) -> str:
    ext = Path(name or "").suffix.lower()
    if ext not in config.ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Only .csv and .json files are supported")
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File is larger than {config.MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    if not data.strip():
        raise HTTPException(400, "File is empty")
    return ext


def _stage_file(workspace_id: int, ext: str, data: bytes) -> Path:
    import uuid

    folder = config.OUTPUT_DIR / "uploads" / f"ws{workspace_id}"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{uuid.uuid4().hex[:12]}{ext}"
    path.write_bytes(data)
    return path


@router.post("/batches/upload", status_code=202)
async def upload_batch(file: UploadFile = File(...), p: Principal = Depends(can_write), db=Depends(get_db)):
    name = Path(file.filename or "").name
    data = await file.read(config.MAX_UPLOAD_BYTES + 1)
    path = _stage_file(p.workspace_id, _check_upload(name, data), data)
    return {"batch_id": start_feed_run(db, p.workspace_id, p.user_id, path, name)}


@router.post("/batches/sample", status_code=202)
def sample_batch(p: Principal = Depends(can_write), db=Depends(get_db)):
    """Run the bundled messy supplier feed (real ingestion and audit, simulated later stages)."""
    source = config.SAMPLE_DIR / "supplier_feed.csv"
    path = _stage_file(p.workspace_id, ".csv", source.read_bytes())
    return {"batch_id": start_feed_run(db, p.workspace_id, p.user_id, path, source.name)}


# ----------------------------------------------------------------- review queue
@router.get("/review")
def review_list(status: Literal["pending", "resolved", "all"] = "pending", p: Principal = Depends(current_principal), db=Depends(get_db)):
    sync_live_batches(db, p.workspace_id)
    cond = {"pending": "AND r.status = 'pending'", "resolved": "AND r.status != 'pending'", "all": ""}[status]
    rows = db.execute(
        "SELECT r.*, p.sku, p.name, p.category, p.quality_score, p.audit_score, p.audit_status FROM review_items r JOIN products p ON p.id = r.product_id "
        f"WHERE r.workspace_id = ? {cond} ORDER BY CASE r.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, r.id", (p.workspace_id,)).fetchall()
    return [dict(id=r["id"], product_id=r["product_id"], sku=r["sku"], name=r["name"], category=r["category"], reason=r["reason"], severity=r["severity"], status=r["status"],
                 quality_score=r["quality_score"], audit_score=r["audit_score"], audit_status=r["audit_status"], created_at=r["created_at"], resolved_at=r["resolved_at"]) for r in rows]


class ResolveIn(BaseModel):
    action: Literal["approve", "reject"]


class BulkResolveIn(ResolveIn):
    ids: list[int] = Field(min_length=1, max_length=100)


def _resolve(db, p: Principal, item_id: int, action: str) -> bool:
    item = db.execute("SELECT * FROM review_items WHERE id = ? AND workspace_id = ?", (item_id, p.workspace_id)).fetchone()
    if item is None or item["status"] != "pending":
        return False
    db.execute("UPDATE review_items SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?", ("approved" if action == "approve" else "rejected", now(), p.user_id, item_id))
    if action == "approve":  # a human override sends the product forward
        db.execute("UPDATE products SET status = 'ready' WHERE id = ?", (item["product_id"],))
    sku = db.execute("SELECT sku FROM products WHERE id = ?", (item["product_id"],)).fetchone()["sku"]
    audit(db, p.workspace_id, p.user_id, f"Review {action}d", sku, item["reason"][:120])
    return True


@router.post("/review/{item_id}/resolve")
def resolve_item(item_id: int, body: ResolveIn, p: Principal = Depends(can_write), db=Depends(get_db)):
    if not _resolve(db, p, item_id, body.action):
        raise HTTPException(404, "Review item not found or already resolved")
    return {"ok": True}


@router.post("/review/bulk")
def resolve_bulk(body: BulkResolveIn, p: Principal = Depends(can_write), db=Depends(get_db)):
    return {"resolved": sum(_resolve(db, p, i, body.action) for i in body.ids)}


# ----------------------------------------------------------------- platforms and publishing
@router.get("/platforms")
def platforms(p: Principal = Depends(current_principal), db=Depends(get_db)):
    rows = db.execute(
        "SELECT pl.*, "
        "SUM(CASE WHEN l.status = 'live' THEN 1 ELSE 0 END) AS live, SUM(CASE WHEN l.status = 'queued' THEN 1 ELSE 0 END) AS queued, "
        "SUM(CASE WHEN l.status = 'suppressed' THEN 1 ELSE 0 END) AS suppressed, AVG(CASE WHEN l.status = 'live' THEN l.rank END) AS avg_rank, "
        "SUM(CASE WHEN l.flag = 'flag' THEN 1 ELSE 0 END) AS flagged "
        "FROM platforms pl LEFT JOIN listings l ON l.platform_key = pl.key AND l.product_id IN (SELECT id FROM products WHERE workspace_id = ?) "
        "WHERE pl.workspace_id = ? GROUP BY pl.id ORDER BY pl.id", (p.workspace_id, p.workspace_id)).fetchall()
    out = []
    for r in rows:
        m = db.execute("SELECT COALESCE(SUM(d.impressions), 0) AS imps, COALESCE(SUM(d.clicks), 0) AS clicks, COALESCE(SUM(d.orders), 0) AS orders, COALESCE(SUM(d.revenue), 0) AS revenue "
                       "FROM performance_daily d JOIN listings l ON l.id = d.listing_id WHERE l.platform_key = ? AND l.product_id IN (SELECT id FROM products WHERE workspace_id = ?)", (r["key"], p.workspace_id)).fetchone()
        out.append(dict(key=r["key"], name=r["name"], kind=r["kind"], region=r["region"], status=r["status"], connected_at=r["connected_at"], rules=loads(r["rules"], {}), live=r["live"] or 0,
                        queued=r["queued"] or 0, suppressed=r["suppressed"] or 0, flagged=r["flagged"] or 0, avg_rank=round(r["avg_rank"], 1) if r["avg_rank"] else None,
                        clicks=m["clicks"], orders=m["orders"], revenue=round(m["revenue"], 2), ctr=round(100 * m["clicks"] / m["imps"], 2) if m["imps"] else None))
    return out


@router.get("/platforms/coverage")
def coverage(p: Principal = Depends(current_principal), db=Depends(get_db)):
    keys = [r["key"] for r in db.execute("SELECT key FROM platforms WHERE workspace_id = ? ORDER BY id", (p.workspace_id,)).fetchall()]
    rows = []
    for c in db.execute("SELECT category, COUNT(*) AS n FROM products WHERE workspace_id = ? AND category IS NOT NULL GROUP BY category ORDER BY category", (p.workspace_id,)).fetchall():
        live = {r["platform_key"]: r["n"] for r in db.execute(
            "SELECT l.platform_key, COUNT(DISTINCT l.product_id) AS n FROM listings l JOIN products p ON p.id = l.product_id WHERE p.workspace_id = ? AND p.category = ? AND l.status = 'live' GROUP BY l.platform_key",
            (p.workspace_id, c["category"])).fetchall()}
        rows.append(dict(category=c["category"], products=c["n"], cells={k: live.get(k, 0) for k in keys}))
    return dict(platforms=keys, rows=rows)


class PlatformStatusIn(BaseModel):
    status: Literal["connected", "disconnected"]


@router.post("/platforms/{key}/status")
def set_platform_status(key: str, body: PlatformStatusIn, p: Principal = Depends(admin_only), db=Depends(get_db)):
    cur = db.execute("UPDATE platforms SET status = ?, connected_at = ? WHERE workspace_id = ? AND key = ?", (body.status, now() if body.status == "connected" else None, p.workspace_id, key))
    if cur.rowcount == 0:
        raise HTTPException(404, "Platform not found")
    audit(db, p.workspace_id, p.user_id, f"Platform {body.status}", key, "Simulated: no marketplace API was called.")
    return {"ok": True}


@router.get("/publishing")
def publishing(p: Principal = Depends(current_principal), db=Depends(get_db)):
    base = ("SELECT l.id, l.platform_key, l.status, l.published_at, l.rank, pl.name AS platform_name, p.id AS product_id, p.sku, p.name, p.quality_score "
            "FROM listings l JOIN products p ON p.id = l.product_id JOIN platforms pl ON pl.key = l.platform_key AND pl.workspace_id = p.workspace_id WHERE p.workspace_id = ? ")
    row = lambda r: dict(id=r["id"], platform_key=r["platform_key"], platform_name=r["platform_name"], status=r["status"], date=r["published_at"], product_id=r["product_id"], sku=r["sku"],
                         name=r["name"], quality_score=r["quality_score"], rank=r["rank"])
    queue = [row(r) for r in db.execute(base + "AND l.status = 'queued' ORDER BY l.published_at, p.sku LIMIT 200", (p.workspace_id,)).fetchall()]
    recent = [row(r) for r in db.execute(base + "AND l.status IN ('live', 'suppressed') ORDER BY l.published_at DESC LIMIT 30", (p.workspace_id,)).fetchall()]
    ready = [dict(product_id=r["id"], sku=r["sku"], name=r["name"], quality_score=r["quality_score"]) for r in db.execute(
        "SELECT id, sku, name, quality_score FROM products WHERE workspace_id = ? AND status = 'ready' ORDER BY sku", (p.workspace_id,)).fetchall()]
    return dict(queue=queue, recent=recent, ready_to_publish=ready, counts=dict(queued=len(queue), ready=len(ready)))

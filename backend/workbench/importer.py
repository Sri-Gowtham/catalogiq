"""Moves feed runs between the platform database and the workbench.

`start_feed_run` submits an upload to the workbench and records a batch. `sync_live_batches` (called whenever the app reads
batches) polls the workbench, mirrors stage progress into the database, and imports products once a run has finished.
"""
from pathlib import Path

from db.core import audit, dumps, now
from seed.catalog_data import CATEGORIES, PLATFORMS
from seed.content import build_content
from workbench import get_workbench

USD_TO_INR = 85.0  # fixed demo rate: uploaded feeds quote price_usd, the workspace reports in rupees
CATEGORY_HINTS = [
    ("CHO", ("choc", "candy", "toffee", "bar", "wafer")),
    ("PET", ("dog", "cat", "pet", "puppy", "kitten")),
    ("SOU", ("soup", "sauce", "ketchup")),
    ("BEV", ("juice", "drink", "water", "tea", "nectar", "coffee")),
    ("BRK", ("cereal", "oats", "flakes", "muesli", "granola")),
    ("SNK", ("chip", "snack", "nut", "cracker", "crisp", "puff")),
]
QUICK_COMMERCE = {"CHO", "SNK", "BEV"}


def _guess_category(*texts: str | None) -> dict:
    haystack = " ".join(t.lower() for t in texts if t)
    for code, words in CATEGORY_HINTS:
        if any(w in haystack for w in words):
            return next(c for c in CATEGORIES if c["code"] == code)
    return next(c for c in CATEGORIES if c["code"] == "SNK")


def start_feed_run(conn, workspace_id: int, user_id: int, file_path: Path, file_name: str) -> int:
    run_id = get_workbench().submit_run(file_path, file_name)
    cur = conn.execute(
        "INSERT INTO batches (workspace_id, name, source_file, kind, status, job_id, stage, stage_index, created_at) VALUES (?, ?, ?, 'live', 'queued', ?, 'ingestion', 0, ?)",
        (workspace_id, Path(file_name).stem.replace("_", " ").title(), file_name, run_id, now()),
    )
    audit(conn, workspace_id, user_id, "Uploaded feed", file_name)
    return cur.lastrowid


def _mirror_stages(conn, workspace_id: int, batch_id: int, stages: list[dict]) -> None:
    conn.execute("DELETE FROM agent_runs WHERE batch_id = ?", (batch_id,))
    for s in stages:
        conn.execute(
            "INSERT INTO agent_runs (workspace_id, batch_id, agent_id, mode, status, started_at, duration_ms, processed, skipped, tokens, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
            (workspace_id, batch_id, s["id"], s["mode"], s["status"], s["started_at"], s["duration_ms"], s["processed"], s["skipped"], s["note"]),
        )


def sync_live_batches(conn, workspace_id: int) -> None:
    wb = get_workbench()
    rows = conn.execute("SELECT * FROM batches WHERE workspace_id = ? AND kind = 'live' AND status IN ('queued', 'running')", (workspace_id,)).fetchall()
    for b in rows:
        run = wb.get_run(b["job_id"])
        if run is None:
            conn.execute("UPDATE batches SET status = 'failed', error = 'The workbench has no record of this run.' WHERE id = ?", (b["id"],))
            continue
        stages = run["stages"]
        done = sum(1 for s in stages if s["status"] == "done")
        current = next((s["id"] for s in stages if s["status"] == "running"), b["stage"])
        _mirror_stages(conn, workspace_id, b["id"], stages)
        if run["status"] in ("completed", "failed"):
            results = wb.get_results(b["job_id"]) or {}
            _import_results(conn, b, results, run, done)
        else:
            conn.execute("UPDATE batches SET status = ?, stage = ?, stage_index = ? WHERE id = ?", ("running" if run["status"] == "running" else "queued", current, done, b["id"]))


def _import_results(conn, batch, results: dict, run: dict, done: int) -> None:
    ws = batch["workspace_id"]
    ts = now()
    imported = flagged = skipped_existing = 0
    for sku in results.get("skus", []):
        n, a = sku["normalized"], sku["audit"] or {}
        if conn.execute("SELECT 1 FROM products WHERE workspace_id = ? AND sku = ?", (ws, n["sku_id"])).fetchone():
            skipped_existing += 1
            continue
        cat = _guess_category(n["product_name"], n["category"])
        is_flagged = sku["skipped_reason"] is not None
        price = round(n["price_usd"] * USD_TO_INR, 2) if n["price_usd"] else None
        enriched = dict(flavour=(n["description"] or "").rstrip("."), ingredients=n["ingredients"], allergens="Allergen information not provided.", keyword=(n["product_name"] or n["sku_id"]).lower())
        cur = conn.execute(
            "INSERT INTO products (workspace_id, batch_id, sku, name, brand, category, line, weight_value, weight_unit, price, country, status, audit_score, audit_status, "
            "audit_issues, source, enriched, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?)",
            (ws, batch["id"], n["sku_id"], n["product_name"], n["brand"], n["category"] or cat["name"], n["product_name"], n["weight_value"], n["weight_unit"], price, n["country_of_origin"],
             "flagged" if is_flagged else "in_enrichment", a.get("audit_score"), a.get("status"), dumps(a.get("issues", [])), dumps(sku["raw_record"]), dumps(enriched), ts),
        )
        pid = cur.lastrowid
        imported += 1
        conn.execute("INSERT INTO product_images (product_id, kind, pack_type, color, bg_white, width, height, quality_score, notes) VALUES (?, 'front', ?, ?, 1, 1200, 1200, 90, 'Illustration: supplier image not fetched')",
                     (pid, cat["pack"], f"{cat['colors'][0]}|{cat['colors'][1]}"))
        if is_flagged:
            flagged += 1
            top = (a.get("issues") or [{"issue": "Data quality too low"}])[0]["issue"]
            conn.execute("INSERT INTO review_items (workspace_id, product_id, reason, severity, status, created_at) VALUES (?, ?, ?, 'high', 'pending', ?)",
                         (ws, pid, f"{sku['skipped_reason']}. Top issue: {top}", ts))
            continue
        product = dict(line=n["product_name"] or n["sku_id"], flavour=enriched["flavour"], ingredients=n["ingredients"], allergens=enriched["allergens"],
                       weight_value=n["weight_value"], weight_unit=n["weight_unit"], price=price, kw=enriched["keyword"])
        for p in PLATFORMS:
            if p["key"] == "blinkit" and cat["code"] not in QUICK_COMMERCE:
                continue
            c = build_content(product, cat, p)
            conn.execute(
                "INSERT INTO product_content (product_id, platform_key, title, title_ar, bullets, description, attributes, keywords, status, simulated, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?)",
                (pid, p["key"], c["title"], c["title_ar"], dumps(c["bullets"]), c["description"], dumps(c["attributes"]), dumps(c["keywords"]), ts),
            )
    failed = run["status"] == "failed"
    conn.execute(
        "UPDATE batches SET status = ?, stage_index = ?, total = ?, flagged = ?, ready = ?, finished_at = ?, error = ? WHERE id = ?",
        ("failed" if failed else "completed", done, imported, flagged, imported - flagged, ts, run.get("error"), batch["id"]),
    )
    rejected = len(results.get("ingest_errors", []))
    detail = f"{imported} products imported, {flagged} flagged, {rejected} rows rejected" + (f", {skipped_existing} already in the catalog" if skipped_existing else "")
    audit(conn, ws, None, "Batch finished" if not failed else "Batch failed", batch["name"], detail)
    conn.execute("INSERT INTO notifications (workspace_id, text, level, created_at) VALUES (?, ?, ?, ?)",
                 (ws, f"{batch['name']}: {detail}.", "success" if not failed and not flagged else "warning", ts))

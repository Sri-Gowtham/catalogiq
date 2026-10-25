"""Moves feed runs between the platform database and the workbench.

`start_feed_run` submits an upload to the workbench and records a batch. `sync_live_batches` (called whenever the app reads
batches) polls the workbench, mirrors stage progress into the database, and imports products once a run has finished.
"""
import re
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
# workflow description channel -> platform key; channels that are not mapped keep the platform's own simulated draft
# (the workflow's "shopify" copy fills the brand website until it names channels by platform key; "retail_site" has no platform yet)
REMOTE_CHANNELS = {"amazon": "amazon_in", "amazon_in": "amazon_in", "shopify": "website", "website": "website", "flipkart": "flipkart", "noon": "noon", "blinkit": "blinkit"}
COPY_OK = {"generated", "ok", "success", "complete", "completed"}  # any other description_status is treated as not AI-written


def _guess_category(*texts: str | None) -> dict:
    haystack = " ".join(t.lower() for t in texts if t)
    for code, words in CATEGORY_HINTS:
        if any(w in haystack for w in words):
            return next(c for c in CATEGORIES if c["code"] == code)
    return next(c for c in CATEGORIES if c["code"] == "SNK")


def _text(v):
    """A scalar the database can hold. The workflow can echo malformed input back (an object where a name should be); that becomes None."""
    if isinstance(v, str):
        return v
    return str(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _remote_copy(value, fallback: dict) -> dict:
    """One channel's text from the workflow (a string or an object), filled from the local draft where parts are missing."""
    if isinstance(value, str):
        value = {"description": value}
    if not isinstance(value, dict):
        return fallback
    bullets = value.get("bullets")
    return dict(title=value.get("title") or fallback["title"], title_ar=None,  # no Arabic title is invented for workflow copy
                bullets=[str(b) for b in bullets] if isinstance(bullets, list) and bullets else fallback["bullets"],
                description=value.get("description") or value.get("text") or fallback["description"],
                attributes=fallback["attributes"], keywords=fallback["keywords"])


def _issues(raw) -> list[dict]:
    """Audit issues in the shape the API serves. The workflow sends {field, severity, issue} without a code, so one is derived."""
    out = []
    for i in raw if isinstance(raw, list) else []:
        if not isinstance(i, dict):
            continue
        text = str(i.get("issue") or "")
        code = i.get("code") or ("missing_field" if text.lower().startswith("missing") else "_".join(re.findall(r"[a-z0-9]+", text.lower())[:4]) or "issue")
        out.append(dict(field=str(i.get("field") or ""), code=str(code), severity=str(i.get("severity") or "low"), issue=text))
    return out


def _image_score(img: dict) -> int:
    """Share of the platform image rules that were checked and met. Rules the workflow could not check (ok = null) do not count."""
    if _num(img.get("score")) is not None:
        return round(img["score"])
    rules = [x for rs in (img.get("platforms") or {}).values() if isinstance(rs, list) for x in rs if isinstance(x, dict) and isinstance(x.get("ok"), bool)]
    if not rules:
        return 90 if img.get("count") else 0
    return round(100 * sum(1 for x in rules if x["ok"]) / len(rules))


def _review_reasons(sku: dict) -> list[str]:
    """Reasons from the workflow's compliance and duplicate checks for a person to look at a product that was not blocked outright."""
    reasons = []
    comp = sku.get("compliance")
    if isinstance(comp, dict) and (comp.get("passed") is False or str(comp.get("status", "")).lower() in ("fail", "failed", "review", "flagged")):
        found = comp.get("violations") or comp.get("issues") or []
        serious = [v for v in found if isinstance(v, dict) and v.get("severity") != "warn"] or found
        first = serious[0] if serious else "brand or claim rule not met"
        if isinstance(first, dict):
            first = f"{first.get('rule') or first.get('issue') or 'rule not met'}" + (f": {first['detail']}" if first.get("detail") else "") + (f" ({first['channel']})" if first.get("channel") else "")
        reasons.append(f"Compliance check: {first}")
    dup = sku.get("duplicate")
    if isinstance(dup, dict) and (dup.get("is_duplicate") or dup.get("duplicate") is True):
        reasons.append(f"Possible duplicate of {dup.get('of_sku') or dup.get('match') or dup.get('duplicate_of') or 'another product'}")
    return reasons


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
            conn.execute("SAVEPOINT import_batch")
            try:
                _import_results(conn, b, results, run, done)
                conn.execute("RELEASE import_batch")
            except Exception as exc:  # one bad record must not leave a batch stuck "running" and break every page that syncs batches
                conn.execute("ROLLBACK TO import_batch")
                conn.execute("RELEASE import_batch")
                conn.execute("UPDATE batches SET status = 'failed', error = ?, finished_at = ? WHERE id = ?", (f"The results could not be imported ({type(exc).__name__}).", now(), b["id"]))
        else:
            conn.execute("UPDATE batches SET status = ?, stage = ?, stage_index = ? WHERE id = ?", ("running" if run["status"] == "running" else "queued", current, done, b["id"]))


def _import_results(conn, batch, results: dict, run: dict, done: int) -> None:
    ws = batch["workspace_id"]
    ts = now()
    imported = flagged = skipped_existing = 0
    for sku in results.get("skus", []):
        n, a = sku["normalized"], sku.get("audit") or {}
        n = {**dict.fromkeys(("product_name", "brand", "category", "description", "weight_value", "weight_unit", "image_url", "price_usd", "country_of_origin")), "ingredients": [], **n}
        n["sku_id"] = _text(n.get("sku_id")) or _text(sku.get("sku_id")) or "unknown"
        for key in ("product_name", "brand", "category", "description", "weight_unit", "image_url", "country_of_origin"):
            n[key] = _text(n[key])
        n["product_name"] = n["product_name"] or n["sku_id"]
        n["weight_value"], n["price_usd"] = _num(n["weight_value"]), _num(n["price_usd"])
        n["ingredients"] = [str(i) for i in n["ingredients"] if isinstance(i, (str, int, float))] if isinstance(n["ingredients"], list) else []
        if conn.execute("SELECT 1 FROM products WHERE workspace_id = ? AND sku = ?", (ws, n["sku_id"])).fetchone():
            skipped_existing += 1
            continue
        cat = _guess_category(n["product_name"], n["category"])
        is_flagged = sku.get("skipped_reason") is not None
        q = sku.get("quality") if isinstance(sku.get("quality"), dict) else None
        quality = round(_num(q.get("score"))) if q and _num(q.get("score")) is not None else None
        parts = q.get("breakdown") if q and isinstance(q.get("breakdown"), dict) else (q or {})
        detail = {k: round(v) for k, v in parts.items() if k != "score" and _num(v) is not None}
        gaps = [str(g) for g in (q or {}).get("gaps", []) if isinstance(g, (str, int))] if q else []
        publish_ready = bool(q.get("publish_ready", q.get("passed"))) if q else None
        if is_flagged:
            status = "flagged"
        elif q is not None and (q.get("publish_ready") is True or q.get("passed") is True):
            status = "ready"
        else:
            status = "in_enrichment"
        price = round(n["price_usd"] * USD_TO_INR, 2) if n["price_usd"] else None
        tax = sku.get("taxonomy") if isinstance(sku.get("taxonomy"), dict) else {}
        enriched = dict(taxonomy=tax.get("path"), flavour=(n["description"] or "").rstrip("."), ingredients=n["ingredients"], allergens="Allergen information not provided.", keyword=(n["product_name"] or n["sku_id"]).lower())
        if publish_ready is not None:
            enriched["gate"] = dict(publish_ready=publish_ready, gaps=gaps)  # the workflow's own decision, shown on the product page
        cur = conn.execute(
            "INSERT INTO products (workspace_id, batch_id, sku, name, brand, category, line, weight_value, weight_unit, price, country, status, audit_score, audit_status, "
            "audit_issues, source, enriched, origin, created_at, quality_score, score_detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?, ?)",
            (ws, batch["id"], n["sku_id"], n["product_name"], n["brand"], n["category"] or cat["name"], n["product_name"], n["weight_value"], n["weight_unit"], price, n["country_of_origin"],
             status, a.get("audit_score", a.get("score")), a.get("status"), dumps(_issues(a.get("issues"))), dumps(sku.get("raw_record", {})), dumps(enriched), ts, quality, dumps(detail) if detail else None),
        )
        pid = cur.lastrowid
        imported += 1
        img = sku.get("images") if isinstance(sku.get("images"), dict) else {}
        img_score = _image_score(img)
        conn.execute("INSERT INTO product_images (product_id, kind, pack_type, color, bg_white, width, height, quality_score, notes) VALUES (?, 'front', ?, ?, 1, 1200, 1200, ?, 'Illustration: supplier image not fetched')",
                     (pid, cat["pack"], f"{cat['colors'][0]}|{cat['colors'][1]}", img_score))
        if is_flagged:
            flagged += 1
            top = (a.get("issues") or [{"issue": "Data quality too low"}])[0]["issue"]
            conn.execute("INSERT INTO review_items (workspace_id, product_id, reason, severity, status, created_at) VALUES (?, ?, ?, 'high', 'pending', ?)",
                         (ws, pid, f"{sku['skipped_reason']}. Top issue: {top}", ts))
            continue
        for reason in _review_reasons(sku):
            conn.execute("INSERT INTO review_items (workspace_id, product_id, reason, severity, status, created_at) VALUES (?, ?, ?, 'medium', 'pending', ?)", (ws, pid, reason, ts))
        product = dict(line=n["product_name"] or n["sku_id"], flavour=enriched["flavour"], ingredients=n["ingredients"], allergens=enriched["allergens"],
                       weight_value=n["weight_value"], weight_unit=n["weight_unit"], price=price, kw=enriched["keyword"])
        descriptions = sku.get("descriptions") if isinstance(sku.get("descriptions"), dict) else {}
        lowered = {k.lower(): v for k, v in descriptions.items() if isinstance(k, str) and v}
        remote = {key: lowered[ch] for ch, key in REMOTE_CHANNELS.items() if ch in lowered}  # later entries win, so an exact platform key beats "shopify"
        ai_written = str(sku.get("description_status", "")).lower() in COPY_OK
        for p in PLATFORMS:
            if p["key"] == "blinkit" and cat["code"] not in QUICK_COMMERCE:
                continue
            c = build_content(product, cat, p)
            from_workflow = p["key"] in remote
            if from_workflow:
                c = _remote_copy(remote[p["key"]], c)
            simulated = 0 if from_workflow and ai_written else 1
            conn.execute(
                "INSERT INTO product_content (product_id, platform_key, title, title_ar, bullets, description, attributes, keywords, status, simulated, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)",
                (pid, p["key"], c["title"], c["title_ar"], dumps(c["bullets"]), c["description"], dumps(c["attributes"]), dumps(c["keywords"]), simulated, ts),
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

"""Populates a workspace with the fictional Acme Foods demo catalog. Deterministic for a given seed.

Everything except the audit scores is sample data. Audit scores come from the real audit agent run over the sample records,
so the "flagged" products are flagged for real reasons."""
import json
import math
import random
from datetime import date, timedelta

import config
from agents.audit import audit_record
from db.core import audit, dumps, now
from pipeline.registry import pipeline_agents
from seed.catalog_data import BRAND, CATEGORIES, PLATFORMS, RULES
from seed.content import build_content, size_text
from seed.packshot import _mix

CATEGORY_PLAN = {  # status counts per category (40 products each)
    "CHO": dict(live=30, ready=4, flagged=3, upcoming=3),
    "SNK": dict(live=28, ready=4, flagged=3, upcoming=5),
    "PET": dict(live=24, ready=3, flagged=8, upcoming=5),
    "SOU": dict(live=20, in_enrichment=14, flagged=2, upcoming=4),
    "BEV": dict(live=18, in_enrichment=16, flagged=2, upcoming=4),
    "BRK": dict(live=20, ready=6, flagged=2, upcoming=12),
}
BATCHES = {  # category code -> (name, status, stage index)
    "CHO": ("Chocolates winter range", "completed", 11),
    "SNK": ("Snacks Q4 refresh", "completed", 11),
    "PET": ("Pet food import", "completed", 11),
    "SOU": ("Soups and sauces refresh", "running", 3),
    "BEV": ("Beverages summer range", "running", 6),
    "BRK": ("Breakfast range", "completed", 11),
}
PLATFORM_ODDS = {"amazon_in": 0.85, "flipkart": 0.7, "noon": 0.35, "blinkit": 0.4, "website": 0.9}
QUICK_COMMERCE = {"CHO", "SNK", "BEV"}
DIAGNOSES = [
    "Title is missing the pack size, so the listing is buried in size searches.",
    "A competitor updated their listing and now ranks above this one.",
    "Description does not match the pack, which is driving a high return rate.",
    "Wrong category was mapped, so the product is shown in the wrong aisle.",
    "Primary keyword is missing from the title and bullets.",
]
IMAGE_DIAGNOSIS = "Main image is not on a plain white background, which limits visibility on this platform."
SCORE_MAX = dict(title=20, attributes=25, readability=15, keywords=15, compliance=15, category=10)


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _scorecard(rng, ratio: float, compliance_ok: bool) -> dict:
    card = {}
    for key, mx in SCORE_MAX.items():
        if key == "compliance":
            card[key] = mx if compliance_ok else 0
        else:
            card[key] = int(round(mx * _clamp(ratio + rng.uniform(-0.07, 0.07), 0.3, 1.0)))
    card["total"] = sum(card.values())
    return card


def _messy(rng, name: str, line: str) -> dict:
    """A supplier row with realistic problems, for products the audit should flag."""
    kind = rng.choice(["bare", "nobrand", "thin"])
    base = dict(name=line.lower(), brand=BRAND, category=None, description=None, ingredients=[], unit=None, country=None)
    if kind == "nobrand":
        base["brand"] = None
        base["description"] = "tasty"
    elif kind == "thin":
        base["description"] = "good"
        base["category"] = "food"
    return base


def seed_workspace(conn, workspace_id: int, today: date | None = None, seed: int = 42) -> dict:
    rng = random.Random(seed)
    today = today or date.today()
    ts = now()

    # --- platforms and rules
    for p in PLATFORMS:
        conn.execute(
            "INSERT INTO platforms (workspace_id, key, name, kind, region, status, connected_at, rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (workspace_id, p["key"], p["name"], p["kind"], p["region"], "attention" if p["key"] == "noon" else "connected", ts, dumps(p["rules"])),
        )
    for region, kind, value, note in RULES:
        conn.execute("INSERT INTO rules (workspace_id, region, kind, value, note) VALUES (?, ?, ?, ?, ?)", (workspace_id, region, kind, value, note))
    platform_by_key = {p["key"]: p for p in PLATFORMS}

    # --- batches
    batch_ids = {}
    for code, (name, status, stage_index) in BATCHES.items():
        stage = pipeline_agents()[min(stage_index, len(pipeline_agents()) - 1)].id
        created = (today - timedelta(days={"completed": rng.randint(20, 90), "running": 0}[status] if status in ("completed", "running") else 0)).isoformat()
        cur = conn.execute(
            "INSERT INTO batches (workspace_id, name, source_file, kind, status, stage, stage_index, created_at, finished_at) VALUES (?, ?, ?, 'demo', ?, ?, ?, ?, ?)",
            (workspace_id, name, f"{code.lower()}_feed.csv", status, stage, stage_index, created + "T09:00:00+00:00", created + "T09:12:00+00:00" if status == "completed" else None),
        )
        batch_ids[code] = cur.lastrowid
    queued = conn.execute(
        "INSERT INTO batches (workspace_id, name, source_file, kind, status, stage, stage_index, created_at) VALUES (?, 'Festive gifting range', 'festive_feed.csv', 'demo', 'queued', 'ingestion', 0, ?)",
        (workspace_id, ts),
    ).lastrowid

    counts = dict(products=0, listings=0, performance_rows=0)
    live_listings = []
    for cat in CATEGORIES:
        code = cat["code"]
        plan = CATEGORY_PLAN[code]
        statuses = [s for s, n in plan.items() for _ in range(n)]
        rng.shuffle(statuses)
        for li, line_def in enumerate(cat["lines"]):
            line, flavour, ingredients, allergens, kw = line_def[:5]
            variants = line_def[5] if len(line_def) > 5 else cat["variants"]
            for vi, (value, unit, price) in enumerate(variants):
                status = statuses[li * 5 + vi]
                size = size_text(value, unit)
                sku = f"ACM-{code}-{li + 1:02d}{vi + 1}"
                name = f"{BRAND} {line} {size}"
                price = round(price * (1 + 0.02 * ((li * 3 + vi) % 5)), 2)
                audit_flagged = status == "flagged" and rng.random() < 0.6
                record = dict(sku_id=sku, product_name=name, brand=BRAND, category=cat["name"], description=flavour + ". " + " ".join([allergens] * 1) + " Store in a cool, dry place away from sunlight.",
                              weight_value=float(value), weight_unit=unit, ingredients=ingredients, image_url=f"https://cdn.acmefoods.example/{sku}.jpg", price_usd=price, country_of_origin=cat["origin"])
                source_row = dict(sku=sku, name=name, brand=BRAND, category=cat["name"], description=record["description"], weight=size, ingredients=", ".join(ingredients), price=price)
                if audit_flagged:
                    m = _messy(rng, name, line)
                    record.update(product_name=m["name"], brand=m["brand"], category=m["category"], description=m["description"], ingredients=m["ingredients"],
                                  weight_unit=None, country_of_origin=m["country"], image_url=None)
                    source_row = dict(sku=sku, name=m["name"], brand=m["brand"] or "", category=m["category"] or "", description=m["description"] or "", weight=str(int(value)) if float(value).is_integer() else str(value), ingredients="", price=price)
                audit_result = audit_record(record)
                audit_status = audit_result["status"]
                # Products that did not pass the audit are removed from the pipeline.
                if audit_flagged and audit_status != "FLAGGED":
                    audit_flagged = False
                    status = "flagged"

                scored = status in ("live", "ready", "flagged", "upcoming") and not audit_flagged
                compliance_ok = True
                if status == "flagged" and not audit_flagged:
                    compliance_ok = rng.random() < 0.4  # either a compliance failure or a low score
                ratio = {"live": rng.uniform(0.8, 0.97), "ready": rng.uniform(0.82, 0.96), "upcoming": rng.uniform(0.78, 0.95), "flagged": rng.uniform(0.55, 0.72), "in_enrichment": 0}[status]
                card = _scorecard(rng, ratio, compliance_ok) if scored else None
                quality = card["total"] if card else None
                if card and status in ("live", "ready", "upcoming") and quality < 72:
                    card = _scorecard(rng, 0.9, True)
                    quality = card["total"]

                launch = (today + timedelta(days=rng.randint(3, 40))).isoformat() if status == "upcoming" else None
                batch_id = batch_ids[code]
                if code == "BRK" and status == "upcoming" and rng.random() < 0.5:
                    batch_id = queued
                cur = conn.execute(
                    "INSERT INTO products (workspace_id, batch_id, sku, name, brand, category, line, weight_value, weight_unit, price, country, status, audit_score, audit_status, "
                    "quality_score, score_detail, audit_issues, source, enriched, launch_date, origin, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?)",
                    (workspace_id, batch_id, sku, name if not audit_flagged else (record["product_name"] or name), record["brand"], cat["name"], line, float(value), unit, price,
                     cat["origin"], status, audit_result["audit_score"], audit_status, quality, dumps(card) if card else None, dumps(audit_result["issues"]),
                     dumps(source_row), dumps(dict(flavour=flavour, ingredients=ingredients, allergens=allergens, keyword=kw)), launch, ts),
                )
                pid = cur.lastrowid
                counts["products"] += 1

                # images: front, back, lifestyle (some are deliberately imperfect)
                color = _mix(cat["colors"][0], 0.82 + 0.06 * (li % 4))
                accent = _mix(cat["colors"][1], 1.0 + 0.02 * (vi % 3))
                low_res = rng.random() < 0.05
                tinted = rng.random() < 0.07
                images = [("front", 600 if low_res else 1200, not tinted)]
                if rng.random() > 0.08:
                    images.append(("back", 1200, True))
                if rng.random() > 0.2 or status == "live":
                    images.append(("lifestyle", 1600, True))
                for kind, px, white in images:
                    qs = 100 - (28 if px < 1000 else 0) - (22 if not white else 0) - (6 if kind == "lifestyle" and rng.random() < 0.3 else 0)
                    note = "Low resolution" if px < 1000 else ("Background is not plain white" if not white else None)
                    conn.execute(
                        "INSERT INTO product_images (product_id, kind, pack_type, color, bg_white, width, height, quality_score, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (pid, kind, cat["pack"], f"{color}|{accent}", int(white), px, px if kind != "lifestyle" else int(px * 2 / 3), qs, note),
                    )

                # platform content
                if status != "in_enrichment" and not audit_flagged:
                    product_for_content = dict(line=line, flavour=flavour, ingredients=ingredients, allergens=allergens, weight_value=value, weight_unit=unit, price=price, kw=kw)
                    cstatus = {"live": "published", "ready": "approved"}.get(status, "draft")
                    for p in PLATFORMS:
                        if p["key"] == "blinkit" and code not in QUICK_COMMERCE:
                            continue
                        c = build_content(product_for_content, cat, p)
                        conn.execute(
                            "INSERT INTO product_content (product_id, platform_key, title, title_ar, bullets, description, attributes, keywords, status, simulated, updated_at) "
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
                            (pid, p["key"], c["title"], c["title_ar"], dumps(c["bullets"]), c["description"], dumps(c["attributes"]), dumps(c["keywords"]), cstatus, ts),
                        )

                # listings: live products are published on a subset of platforms; upcoming ones are queued
                if status in ("live", "upcoming"):
                    keys = [k for k, odds in PLATFORM_ODDS.items() if rng.random() < odds and not (k == "blinkit" and code not in QUICK_COMMERCE)]
                    while len(keys) < 2:
                        pick = rng.choice([k for k in PLATFORM_ODDS if k not in keys and not (k == "blinkit" and code not in QUICK_COMMERCE)])
                        keys.append(pick)
                    front_white = not tinted
                    popularity = rng.lognormvariate(0, 0.7)
                    for k in keys:
                        pstatus = "live" if status == "live" else "queued"
                        published = (today - timedelta(days=rng.randint(25, 220))).isoformat() if status == "live" else launch
                        lp = round(price * rng.uniform(0.95, 1.0), 2)
                        cur = conn.execute(
                            "INSERT INTO listings (product_id, platform_key, status, published_at, price, primary_keyword, flag) VALUES (?, ?, ?, ?, ?, ?, 'ok')",
                            (pid, k, pstatus, published, lp, kw),
                        )
                        counts["listings"] += 1
                        if status == "live":
                            live_listings.append(dict(id=cur.lastrowid, pid=pid, key=k, price=lp, pop=popularity, tinted=tinted and platform_by_key[k]["rules"]["images"]["white_bg"], code=code))

    # --- 30 days of performance for live listings; engineer some underperformers
    n = len(live_listings)
    chosen = rng.sample(range(n), min(n, 44))
    bad = set(chosen[:18])
    watch = set(chosen[18:44])
    suppressed = set(chosen[:4])
    for i, L in enumerate(live_listings):
        under = i in bad
        rank = _clamp(int(rng.gauss(14 / math.sqrt(L["pop"]), 7)) + 2, 1, 60) + (28 if under else 0)
        base_imps = 900 * L["pop"] * (0.6 if L["key"] == "noon" else 1.0)
        conv = rng.uniform(0.03, 0.06) * (0.4 if under else 1.0)
        ret = rng.uniform(0.01, 0.025) * (3.5 if under else 1.0)
        ranks = []
        for d in range(29, -1, -1):
            drift = (0.5 if under else (0.25 if i in watch else 0)) if d < 14 else 0
            rank = int(_clamp(rank + rng.gauss(drift, 1.8), 1, 100))
            ranks.append(rank)
            imps = int(base_imps * math.exp(-0.03 * (rank - 1)) * rng.uniform(0.85, 1.15))
            ctr = _clamp(0.07 * math.exp(-0.035 * (rank - 1)) + 0.004, 0.002, 0.09)
            clicks = int(imps * ctr)
            orders = int(clicks * conv * rng.uniform(0.8, 1.2))
            conn.execute(
                "INSERT INTO performance_daily (listing_id, day, rank, impressions, clicks, orders, revenue, returns) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (L["id"], (today - timedelta(days=d)).isoformat(), rank, imps, clicks, orders, round(orders * L["price"], 2), int(orders * ret)),
            )
            counts["performance_rows"] += 1
        flag, diag = "ok", None
        if i in suppressed:
            flag, diag = "flag", "Listing suppressed: the mandatory allergen field is missing on this platform."
            conn.execute("UPDATE listings SET status = 'suppressed' WHERE id = ?", (L["id"],))
        elif under:
            flag = "flag"
            diag = IMAGE_DIAGNOSIS if L["tinted"] else rng.choice(DIAGNOSES)
        elif i in watch:
            flag, diag = "watch", rng.choice(DIAGNOSES[:2])
        conn.execute("UPDATE listings SET rank = ?, rank_prev = ?, flag = ?, diagnosis = ? WHERE id = ?", (ranks[-1], ranks[-8], flag, diag, L["id"]))

    # --- A/B tests on flagged listings
    rows = conn.execute(
        "SELECT l.id, pc.title FROM listings l JOIN product_content pc ON pc.product_id = l.product_id AND pc.platform_key = l.platform_key "
        "JOIN products p ON p.id = l.product_id WHERE p.workspace_id = ? AND l.flag = 'flag' LIMIT 6", (workspace_id,)).fetchall()
    for k, r in enumerate(rows):
        improved = r["title"].replace(" | ", " | Best seller | ", 1) if " | " in r["title"] else r["title"] + " | Family pack"
        done = k % 2 == 0
        conn.execute(
            "INSERT INTO ab_tests (listing_id, variant_a, variant_b, status, winner, uplift_pct, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (r["id"], r["title"], improved, "completed" if done else "running", "B" if done else None, round(rng.uniform(6, 22), 1) if done else None, (today - timedelta(days=rng.randint(4, 15))).isoformat()),
        )

    # --- review queue: every flagged product, plus a few resolved items for history
    flagged = conn.execute("SELECT id, audit_status, quality_score, score_detail, audit_issues FROM products WHERE workspace_id = ? AND status = 'flagged'", (workspace_id,)).fetchall()
    for k, p in enumerate(flagged):
        if p["audit_status"] == "FLAGGED":
            issues = [i["issue"] for i in json.loads(p["audit_issues"])][:2]
            reason, severity = "Data quality too low to enrich: " + "; ".join(issues), "high"
        else:
            card = json.loads(p["score_detail"]) if p["score_detail"] else {}
            if card.get("compliance") == 0:
                reason, severity = "Brand rulebook violation: a restricted claim was found in the generated copy.", "high"
            else:
                reason, severity = f"Quality score {p['quality_score']} is below the gate of 70.", "medium"
        resolved = k >= len(flagged) - 5
        conn.execute(
            "INSERT INTO review_items (workspace_id, product_id, reason, severity, status, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (workspace_id, p["id"], reason, severity, rng.choice(["approved", "rejected"]) if resolved else "pending", ts, ts if resolved else None),
        )

    # --- agent runs for each batch (live agents have real timings; the rest are sample numbers)
    agents = pipeline_agents()
    for code, bid in batch_ids.items():
        name, status, stage_index = BATCHES[code]
        total = conn.execute("SELECT COUNT(*) FROM products WHERE batch_id = ?", (bid,)).fetchone()[0]
        for ai, a in enumerate(agents):
            st = "done" if ai < stage_index or status == "completed" else ("running" if ai == stage_index else "pending")
            conn.execute(
                "INSERT INTO agent_runs (workspace_id, batch_id, agent_id, mode, status, started_at, duration_ms, processed, skipped, tokens, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (workspace_id, bid, a.id, a.mode, st, ts if st != "pending" else None, rng.randint(40, 1800) if st == "done" else None, total if st != "pending" else None,
                 rng.randint(0, 3) if st == "done" else None, None if a.mode == "live" else rng.randint(2000, 90000) if st == "done" else None,
                 None if a.mode == "live" else "Sample figures"),
            )

    for text, level in [("Beverages summer range is at the brand compliance stage.", "info"), ("Noon connection token expires in 6 days.", "warning"),
                        ("18 listings are underperforming and have a diagnosis.", "warning"), ("Pet food import: 8 products were flagged for review.", "info"),
                        ("Snacks Q4 refresh finished with 3 products flagged.", "success")]:
        conn.execute("INSERT INTO notifications (workspace_id, text, level, created_at) VALUES (?, ?, ?, ?)", (workspace_id, text, level, ts))
    for action, entity in [("Uploaded feed", "Beverages summer range"), ("Approved product", "ACM-CHO-021"), ("Published 24 listings", "Snacks Q4 refresh"), ("Updated rulebook", "Restricted claims")]:
        audit(conn, workspace_id, None, action, entity)

    conn.execute("UPDATE workspaces SET is_demo = 1, onboarded = 1 WHERE id = ?", (workspace_id,))
    conn.execute("UPDATE batches SET total = (SELECT COUNT(*) FROM products WHERE batch_id = batches.id), "
                 "flagged = (SELECT COUNT(*) FROM products WHERE batch_id = batches.id AND status = 'flagged'), "
                 "ready = (SELECT COUNT(*) FROM products WHERE batch_id = batches.id AND status IN ('ready', 'live')) WHERE workspace_id = ?", (workspace_id,))
    return counts


def ensure_demo_account(conn) -> int:
    """Create the demo workspace and its three users (admin, manager, viewer) once."""
    from auth.security import hash_password

    row = conn.execute("SELECT id FROM users WHERE email = ?", (config.DEMO_EMAIL,)).fetchone()
    if row:
        return conn.execute("SELECT workspace_id FROM memberships WHERE user_id = ?", (row["id"],)).fetchone()["workspace_id"]
    ts = now()
    wid = conn.execute("INSERT INTO workspaces (name, industry, sku_range, plan, created_at) VALUES ('Acme Foods (demo)', 'FMCG', '100-500', 'growth', ?)", (ts,)).lastrowid
    for email, name, role in [(config.DEMO_EMAIL, "Dana Rao", "admin"), ("manager@acmefoods.example", "Manoj Iyer", "manager"), ("viewer@acmefoods.example", "Vera Nair", "viewer")]:
        uid = conn.execute("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)", (email, name, hash_password(config.DEMO_PASSWORD), ts)).lastrowid
        conn.execute("INSERT INTO memberships (workspace_id, user_id, role) VALUES (?, ?, ?)", (wid, uid, role))
    seed_workspace(conn, wid)
    return wid

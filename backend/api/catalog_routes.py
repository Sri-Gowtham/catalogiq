from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from api.models import (AbTestOut, AuditIssueOut, ContentOut, Facets, FacetCount, ImageOut, ListingOut, ListingPerformance, PerfPoint,
                        PlatformImageReport, ProductDetail, ProductList, ProductSummary, ReviewItemOut)
from auth.deps import Principal, can_write, current_principal
from db.core import audit, dumps, get_db, loads, now
from seed.content import image_checks, size_text
from seed.packshot import render_svg
from workbench.importer import sync_live_batches

router = APIRouter(prefix="/api", tags=["catalog"])

SORTS = {
    "name": "p.name COLLATE NOCASE ASC",
    "sku": "p.sku ASC",
    "quality": "p.quality_score DESC NULLS LAST",
    "quality_asc": "p.quality_score ASC NULLS LAST",
    "rank": "best_rank ASC NULLS LAST",
    "launch": "p.launch_date ASC NULLS LAST",
    "status": "p.status ASC, p.sku ASC",
}
PRODUCT_SELECT = """
SELECT p.*,
  (SELECT group_concat(platform_key) FROM listings l WHERE l.product_id = p.id AND l.status = 'live') AS live_platforms,
  (SELECT MIN(rank) FROM listings l WHERE l.product_id = p.id AND l.status = 'live') AS best_rank,
  (SELECT MAX(CASE flag WHEN 'flag' THEN 2 WHEN 'watch' THEN 1 ELSE 0 END) FROM listings l WHERE l.product_id = p.id) AS flag_level
FROM products p
"""


def summarise(r) -> ProductSummary:
    return ProductSummary(
        id=r["id"], sku=r["sku"], name=r["name"], category=r["category"], status=r["status"], audit_score=r["audit_score"], audit_status=r["audit_status"],
        quality_score=r["quality_score"], launch_date=r["launch_date"], live_platforms=(r["live_platforms"] or "").split(",") if r["live_platforms"] else [],
        best_rank=r["best_rank"], flag={2: "flag", 1: "watch"}.get(r["flag_level"] or 0, "ok"), batch_id=r["batch_id"], origin=r["origin"],
    )


@router.get("/products", response_model=ProductList)
def list_products(
    status: str | None = None, category: str | None = None, platform: str | None = None, q: str | None = Query(None, max_length=80),
    batch_id: int | None = None, flagged: bool = False, sort: str = "sku", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
    p: Principal = Depends(current_principal), db=Depends(get_db),
):
    sync_live_batches(db, p.workspace_id)
    where, args = ["p.workspace_id = ?"], [p.workspace_id]
    if status:
        wanted = [s for s in status.split(",") if s]
        where.append(f"p.status IN ({','.join('?' * len(wanted))})")
        args += wanted
    if category:
        where.append("p.category = ?")
        args.append(category)
    if platform:
        where.append("EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.platform_key = ? AND l.status = 'live')")
        args.append(platform)
    if q:
        where.append("(p.sku LIKE ? OR p.name LIKE ?)")
        args += [f"%{q}%", f"%{q}%"]
    if batch_id:
        where.append("p.batch_id = ?")
        args.append(batch_id)
    if flagged:
        where.append("EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.flag IN ('flag', 'watch'))")
    clause = " WHERE " + " AND ".join(where)
    total = db.execute(f"SELECT COUNT(*) FROM products p{clause}", args).fetchone()[0]
    rows = db.execute(f"{PRODUCT_SELECT}{clause} ORDER BY {SORTS.get(sort, SORTS['sku'])} LIMIT ? OFFSET ?", args + [page_size, (page - 1) * page_size]).fetchall()
    return ProductList(items=[summarise(r) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/products/facets", response_model=Facets)
def facets(p: Principal = Depends(current_principal), db=Depends(get_db)):
    def counts(sql):
        return [FacetCount(key=r[0], count=r[1]) for r in db.execute(sql, (p.workspace_id,)).fetchall() if r[0]]
    return Facets(
        status=counts("SELECT status, COUNT(*) FROM products WHERE workspace_id = ? GROUP BY status ORDER BY COUNT(*) DESC"),
        category=counts("SELECT category, COUNT(*) FROM products WHERE workspace_id = ? GROUP BY category ORDER BY category"),
        platform=counts("SELECT l.platform_key, COUNT(DISTINCT l.product_id) FROM listings l JOIN products p ON p.id = l.product_id WHERE p.workspace_id = ? AND l.status = 'live' GROUP BY l.platform_key"),
    )


def _product_or_404(db, product_id: int, workspace_id: int):
    row = db.execute("SELECT * FROM products WHERE id = ? AND workspace_id = ?", (product_id, workspace_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Product not found")
    return row


@router.get("/products/{product_id}", response_model=ProductDetail)
def product_detail(product_id: int, p: Principal = Depends(current_principal), db=Depends(get_db)):
    sync_live_batches(db, p.workspace_id)
    r = _product_or_404(db, product_id, p.workspace_id)
    platforms = db.execute("SELECT key, name, kind, rules FROM platforms WHERE workspace_id = ? ORDER BY id", (p.workspace_id,)).fetchall()
    images = [dict(i) for i in db.execute("SELECT * FROM product_images WHERE product_id = ? ORDER BY id", (product_id,)).fetchall()]
    listings = db.execute(
        "SELECT l.*, pl.name AS platform_name, COALESCE(SUM(d.clicks), 0) AS clicks, COALESCE(SUM(d.orders), 0) AS orders, COALESCE(SUM(d.revenue), 0) AS revenue "
        "FROM listings l JOIN platforms pl ON pl.key = l.platform_key AND pl.workspace_id = ? LEFT JOIN performance_daily d ON d.listing_id = l.id WHERE l.product_id = ? GROUP BY l.id ORDER BY l.id",
        (p.workspace_id, product_id)).fetchall()
    listed_keys = {l["platform_key"] for l in listings}
    content_rows = {c["platform_key"]: c for c in db.execute("SELECT * FROM product_content WHERE product_id = ?", (product_id,)).fetchall()}

    content, reports = [], []
    for pl in platforms:
        rules = loads(pl["rules"], {})
        c = content_rows.get(pl["key"])
        if c:
            bullets, attrs, kws = loads(c["bullets"], []), loads(c["attributes"], {}), loads(c["keywords"], [])
            text = (c["title"] + " " + " ".join(bullets)).lower()
            mandatory = [m for m in rules.get("mandatory", []) if _is_missing(m, c, bullets, attrs)]
            content.append(ContentOut(
                platform_key=pl["key"], platform_name=pl["name"], kind=pl["kind"], status=c["status"], simulated=bool(c["simulated"]), title=c["title"], title_ar=c["title_ar"],
                title_limit=rules.get("title_limit"), bullets=bullets, bullet_limit=rules.get("bullet_limit"), bullet_count=rules.get("bullet_count"), description=c["description"],
                description_limit=rules.get("desc_limit"), attributes=attrs, mandatory_missing=mandatory, keywords=kws, keyword_hits=[k for k in kws if k.lower().split()[0] in text],
                listed=pl["key"] in listed_keys))
        if images and c and rules.get("images"):
            reports.append(PlatformImageReport(platform_key=pl["key"], platform_name=pl["name"], checks=image_checks(images, rules["images"])))

    batch = db.execute("SELECT name FROM batches WHERE id = ?", (r["batch_id"],)).fetchone() if r["batch_id"] else None
    review = db.execute("SELECT * FROM review_items WHERE product_id = ? ORDER BY id DESC LIMIT 1", (product_id,)).fetchone()
    tests = db.execute("SELECT t.*, l.platform_key FROM ab_tests t JOIN listings l ON l.id = t.listing_id WHERE l.product_id = ? ORDER BY t.id", (product_id,)).fetchall()
    card = loads(r["score_detail"])
    gate_blocked, gate_reason = False, None
    if r["status"] == "flagged":
        gate_blocked = True
        if r["audit_status"] == "FLAGGED":
            gate_reason = "Removed after the data audit: the record was too incomplete to enrich."
        elif card and card.get("compliance") == 0:
            gate_reason = "Blocked by the brand rulebook: any compliance violation blocks publishing, whatever the total score."
        else:
            gate_reason = f"Blocked by the quality gate: score {r['quality_score']} is below 70."
    return ProductDetail(
        id=r["id"], sku=r["sku"], name=r["name"], brand=r["brand"], category=r["category"], line=r["line"], size=size_text(r["weight_value"], r["weight_unit"]) if r["weight_value"] is not None else None,
        price=r["price"], country=r["country"], status=r["status"], origin=r["origin"], launch_date=r["launch_date"], batch_id=r["batch_id"], batch_name=batch["name"] if batch else None,
        audit_score=r["audit_score"], audit_status=r["audit_status"], audit_issues=[AuditIssueOut(**i) for i in loads(r["audit_issues"], [])], quality_score=r["quality_score"],
        score_detail=card, gate_blocked=gate_blocked, gate_reason=gate_reason, source=loads(r["source"], {}), enriched=loads(r["enriched"], {}),
        images=[ImageOut(kind=i["kind"], width=i["width"], height=i["height"], bg_white=bool(i["bg_white"]), quality_score=i["quality_score"], notes=i["notes"]) for i in images],
        image_reports=reports, content=content,
        listings=[ListingOut(id=l["id"], platform_key=l["platform_key"], platform_name=l["platform_name"], status=l["status"], published_at=l["published_at"], price=l["price"], rank=l["rank"],
                             rank_prev=l["rank_prev"], primary_keyword=l["primary_keyword"], flag=l["flag"] or "ok", diagnosis=l["diagnosis"], clicks_30d=l["clicks"], orders_30d=l["orders"],
                             revenue_30d=round(l["revenue"], 2)) for l in listings],
        review=ReviewItemOut(id=review["id"], product_id=review["product_id"], reason=review["reason"], severity=review["severity"], status=review["status"], created_at=review["created_at"],
                             resolved_at=review["resolved_at"]) if review else None,
        ab_tests=[AbTestOut(id=t["id"], listing_id=t["listing_id"], platform_key=t["platform_key"], variant_a=t["variant_a"], variant_b=t["variant_b"], status=t["status"], winner=t["winner"],
                            uplift_pct=t["uplift_pct"], started_at=t["started_at"]) for t in tests],
    )


def _is_missing(field: str, content_row, bullets: list, attrs: dict) -> bool:
    """A mandatory platform field counts as missing when it has no value in the content or its attributes."""
    if field in ("title", "title_en_ar"):
        return not content_row["title"] or (field == "title_en_ar" and not content_row["title_ar"])
    if field in ("bullets", "features"):
        return not bullets
    if field == "description":
        return not content_row["description"]
    if field == "weight":
        return not attrs.get("weight")
    return not attrs.get(field)


@router.get("/products/{product_id}/performance", response_model=list[ListingPerformance])
def product_performance(product_id: int, p: Principal = Depends(current_principal), db=Depends(get_db)):
    _product_or_404(db, product_id, p.workspace_id)
    out = []
    for l in db.execute("SELECT l.id, l.platform_key, pl.name FROM listings l JOIN platforms pl ON pl.key = l.platform_key AND pl.workspace_id = ? WHERE l.product_id = ? AND l.status != 'queued'", (p.workspace_id, product_id)).fetchall():
        pts = db.execute("SELECT day, rank, impressions, clicks, orders, revenue, returns FROM performance_daily WHERE listing_id = ? ORDER BY day", (l["id"],)).fetchall()
        out.append(ListingPerformance(listing_id=l["id"], platform_key=l["platform_key"], platform_name=l["name"], points=[PerfPoint(**dict(x)) for x in pts]))
    return out


@router.get("/products/{product_id}/image/{kind}.svg")
def product_image(product_id: int, kind: str, p: Principal = Depends(current_principal), db=Depends(get_db)):
    r = _product_or_404(db, product_id, p.workspace_id)
    img = db.execute("SELECT * FROM product_images WHERE product_id = ? AND kind = ?", (product_id, kind)).fetchone()
    if img is None:
        raise HTTPException(404, "No such image")
    color, accent = img["color"].split("|")
    size = size_text(r["weight_value"], r["weight_unit"]) if r["weight_value"] is not None else ""
    svg = render_svg(img["pack_type"], color, accent, "Acme" if r["origin"] == "demo" else (r["brand"] or "Brand"), r["line"] or r["name"] or r["sku"], size, kind, bool(img["bg_white"]))
    return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "private, max-age=300"})


class ContentEdit(BaseModel):
    title: str | None = Field(default=None, max_length=400)
    bullets: list[str] | None = None
    description: str | None = Field(default=None, max_length=4000)


@router.patch("/products/{product_id}/content/{platform_key}")
def edit_content(product_id: int, platform_key: str, body: ContentEdit, p: Principal = Depends(can_write), db=Depends(get_db)):
    _product_or_404(db, product_id, p.workspace_id)
    row = db.execute("SELECT * FROM product_content WHERE product_id = ? AND platform_key = ?", (product_id, platform_key)).fetchone()
    if row is None:
        raise HTTPException(404, "No content for this platform")
    title = body.title if body.title is not None else row["title"]
    bullets = body.bullets if body.bullets is not None else loads(row["bullets"], [])
    desc = body.description if body.description is not None else row["description"]
    db.execute("UPDATE product_content SET title = ?, bullets = ?, description = ?, status = 'draft', updated_at = ? WHERE id = ?", (title, dumps(bullets), desc, now(), row["id"]))
    audit(db, p.workspace_id, p.user_id, "Edited content", f"product {product_id}", platform_key)
    return {"ok": True}


class PublishIn(BaseModel):
    platforms: list[str] = Field(min_length=1)


@router.post("/products/{product_id}/publish")
def publish(product_id: int, body: PublishIn, p: Principal = Depends(can_write), db=Depends(get_db)):
    r = _product_or_404(db, product_id, p.workspace_id)
    if r["status"] not in ("ready", "upcoming", "live"):
        raise HTTPException(409, "Only products that passed the quality gate can be published.")
    if r["quality_score"] is None or r["quality_score"] < 70:
        raise HTTPException(409, "The quality gate blocks anything below 70.")
    card = loads(r["score_detail"], {})
    if card.get("compliance") == 0:
        raise HTTPException(409, "A brand rulebook violation blocks publishing.")
    known = {x["key"] for x in db.execute("SELECT key FROM platforms WHERE workspace_id = ? AND status != 'disconnected'", (p.workspace_id,)).fetchall()}
    results = []
    for key in body.platforms:
        if key not in known:
            raise HTTPException(422, f"Platform {key} is not connected")
        content = db.execute("SELECT 1 FROM product_content WHERE product_id = ? AND platform_key = ?", (product_id, key)).fetchone()
        if not content:
            raise HTTPException(409, f"There is no content for {key} yet.")
        ts = now()
        db.execute("INSERT INTO listings (product_id, platform_key, status, published_at, price, primary_keyword, flag) VALUES (?, ?, 'live', ?, ?, ?, 'ok') "
                   "ON CONFLICT (product_id, platform_key) DO UPDATE SET status = 'live', published_at = excluded.published_at", (product_id, key, ts, r["price"], loads(r["enriched"], {}).get("keyword")))
        db.execute("UPDATE product_content SET status = 'published' WHERE product_id = ? AND platform_key = ?", (product_id, key))
        results.append({"platform": key, "status": "accepted", "message": "Simulated: no marketplace API was called."})
    db.execute("UPDATE products SET status = 'live' WHERE id = ?", (product_id,))
    audit(db, p.workspace_id, p.user_id, "Published product", r["sku"], ", ".join(body.platforms))
    return {"product_id": product_id, "results": results}

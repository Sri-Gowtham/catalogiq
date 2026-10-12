import pytest

from agents.audit import audit_record, audit_records
from agents.ingestion import ingest_feed, parse_ingredients, parse_price, parse_weight
from config import SAMPLE_DIR


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("50g", (50.0, "g")),
        ("50 g", (50.0, "g")),
        ("50 Gram", (50.0, "g")),
        ("3 KG", (3.0, "kg")),
        ("1.36L", (1.36, "l")),
        ("50", (50.0, None)),  # the unit is never guessed
        ("12 fl oz", (None, None)),
        ("", (None, None)),
        (None, (None, None)),
    ],
)
def test_parse_weight(raw, expected):
    assert parse_weight(raw) == expected


def test_parse_price_and_ingredients():
    assert parse_price("$3.99") == 3.99
    assert parse_price("n/a") is None
    assert parse_ingredients("sugar, choco ; nuts") == ["sugar", "choco", "nuts"]
    assert parse_ingredients(None) == []


def test_ingest_csv_rejects_bad_rows_without_crashing():
    out = ingest_feed(SAMPLE_DIR / "supplier_feed.csv")
    reasons = [e["reason"] for e in out["errors"]]
    assert reasons.count("missing sku_id") == 2
    assert any("duplicate sku_id" in r for r in reasons)
    assert out["summary"]["ok"] + out["summary"]["failed"] == out["summary"]["total"]
    first = out["records"][0]
    assert first["weight_value"] == 50.0 and first["weight_unit"] == "g"
    assert first["raw_record"]["product_name"] == "Snickers Peanut Chocolate Bar 50g"


def test_ingest_json_maps_aliases():
    out = ingest_feed(SAMPLE_DIR / "supplier_feed.json")
    assert out["summary"]["format"] == "json"
    assert out["summary"]["failed"] == 1
    corn = next(r for r in out["records"] if r["sku_id"] == "DFD-1001")
    assert corn["product_name"] == "Kellogg's Corn Flakes 500g"
    assert corn["weight_unit"] == "g" and corn["price_usd"] == 3.99
    assert len(corn["ingredients"]) == 6


def test_audit_scores_clean_record_high_and_messy_record_low():
    out = ingest_feed(SAMPLE_DIR / "supplier_feed.csv")
    by_id = {r["sku_id"]: r for r in out["records"]}
    clean = audit_record(by_id["MAR-CHO-001"])
    messy = audit_record(by_id["MAR-CHO-004"])
    empty = audit_record(by_id["MAR-CHO-014"])
    assert clean["status"] == "PASS" and clean["audit_score"] >= 90
    assert messy["status"] in ("REVIEW", "FLAGGED") and messy["audit_score"] < clean["audit_score"]
    codes = {i["code"] for i in messy["issues"]}
    assert {"name_lowercase", "weight_unit_missing", "description_short", "category_generic"} <= codes
    assert empty["status"] == "FLAGGED"


def test_missing_core_field_caps_status_at_review():
    out = ingest_feed(SAMPLE_DIR / "supplier_feed.csv")
    by_id = {r["sku_id"]: r for r in out["records"]}
    prego = audit_record(by_id["CAM-SAU-009"])  # no brand, price -1, otherwise scores 70+
    assert prego["audit_score"] >= 70
    assert prego["status"] == "REVIEW"
    assert [i["severity"] for i in prego["issues"]] == sorted(
        (i["severity"] for i in prego["issues"]), key=["high", "medium", "low"].index
    )


def test_audit_summary_covers_all_three_statuses():
    out = ingest_feed(SAMPLE_DIR / "supplier_feed.csv")
    audit = audit_records(out["records"])
    counts = audit["summary"]["status_counts"]
    assert all(counts[s] > 0 for s in ("PASS", "REVIEW", "FLAGGED"))
    assert sum(counts.values()) == audit["summary"]["total"] == len(out["records"])
    assert len(audit["summary"]["top_issues"]) == 3

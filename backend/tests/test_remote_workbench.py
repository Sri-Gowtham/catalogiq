"""The remote workbench against a fake webhook (httpx.MockTransport): no network, no model credit.

The fake answers in the shape of a real run of the "CatalogIQ with agents" workflow (catalogiq.result.v2), trimmed:
the summaries are shortened and the per-platform image rules are cut to two rules. Field names and nesting are the real ones.
"""
import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient

import config
from auth import security
from pipeline import store
from workbench import remote as remote_module, set_workbench
from workbench.remote import RemoteWorkbench

URL = "https://agents.example.test/webhook/secret-path-123"
FEED = (
    "sku_id,product_name,brand,category,description,weight,ingredients,image_url,price_usd,country_of_origin\n"
    "RW-1,Masala Oats,Acme,Cereal,Spiced oats,400g,oats;salt,https://img.example/1.jpg,3.99,India\n"
    "RW-2,Choco Bar,Acme,Chocolate,Milk chocolate,50g,cocoa;sugar,https://img.example/2.jpg,1.20,India\n"
)
IMAGE_RULES = {"amazon_in": [{"rule": "At least 3 images", "ok": False, "detail": "1 image link(s) supplied"}, {"rule": "Image link is a secure web address (https)", "ok": True, "detail": None},
                             {"rule": "Resolution at least 1000 px", "ok": None, "detail": "Not checked: needs a vision model"}]}


CHANNELS = ("amazon_in", "flipkart", "noon", "blinkit", "website")


def _sku(raw: dict, *, quality=63, ready=False, compliance="pass", duplicate_of=None, flagged=False, gaps=(), channels=CHANNELS, broken=False) -> dict:
    sku_id = raw["sku_id"]
    base = {"sku_id": sku_id, "raw_record": raw, "fixes_applied": [], "publishing": None,
            "normalized": {"sku_id": sku_id, "product_name": raw.get("product_name"), "brand": "Acme", "category": "Cereal", "description": "d", "weight_value": 400, "weight_unit": "g",
                           "ingredients": ["oats"], "image_url": raw.get("image_url"), "price_usd": 3.99, "country_of_origin": "India"}}
    if broken:  # what the workflow really echoed for a product with an object where its name belongs (run phaseC-run4, B-1)
        base["normalized"] = {**base["normalized"], "product_name": {"bad": True}, "price_usd": None}
        base["raw_record"] = {**raw, "product_name": {"bad": True}}
        flagged = True
    if flagged:
        return {**base, "audit": {"audit_score": 6, "status": "FLAGGED", "issues": [{"field": "brand", "severity": "high", "issue": "Missing required field: brand"}]},
                "duplicate": None, "images": None, "descriptions": None, "description_status": None, "taxonomy": None, "compliance": None, "quality": None,
                "skipped_reason": "Data quality too low (audit score 6); not sent to enrichment"}
    violations = [{"channel": "retail_site", "rule": "too_short", "severity": "warn", "detail": "24 words"}]
    if compliance == "fail":
        violations.append({"channel": "amazon", "rule": "banned_term", "severity": "error", "detail": "miracle"})
    return {**base, "audit": {"audit_score": 93, "status": "PASS", "issues": []},
            "duplicate": {"is_duplicate": duplicate_of is not None, "of_sku": duplicate_of, "similarity": 1 if duplicate_of else 0, "method": "lexical_overlap"},
            "images": {"count": 1, "urls": [raw.get("image_url")], "analysis_level": "metadata_only", "platforms": IMAGE_RULES},
            "descriptions": {k: {"title": f"{k} title for {sku_id}", "bullets": ["First point.", "Second point.", "Third point."], "description": f"{k} copy for {sku_id}."} for k in channels},
            "description_status": "generated",
            "taxonomy": {"path": "Grocery > Snacks > Confectionery", "confidence": 0.65, "needs_review": False, "method": "keyword_rules_v1"},
            "compliance": {"status": compliance, "score": 95, "violations": violations, "ruleset": "brand_rules_v1"},
            "quality": {"score": quality, "grade": "B" if ready else "D", "publish_ready": ready, "threshold": 70,
                        "breakdown": {"identity": 20, "attributes": None, "description": 13.3, "taxonomy": 10, "imagery": 10, "compliance": 10, "localization": None}, "gaps": list(gaps)},
            "skipped_reason": None}


def _document(items: list[dict], specs: dict) -> dict:
    skus = [_sku(raw, **specs.get(raw["sku_id"], {})) for raw in items]
    return {"schema_version": "catalogiq.result.v2", "generated_at": "2026-10-25T04:21:31Z", "simulated": True, "notes": ["Publishing is simulated: no marketplace API was called."],
            "ingest_summary": {"total": len(items), "ok": len(items), "failed": 0}, "ingest_errors": [],
            "audit_summary": {"total": len(items), "average_score": 93}, "duplicate_summary": {}, "image_summary": {},
            "attribute_extraction_summary": {"status": "skipped: no Gemini key set", "products_sent": 0},
            "taxonomy_summary": {"checked": len(items), "mapped": len(items)}, "competitive_summary": {"simulated": True, "checked": len(items)},
            "description_summary": {"products_sent": len(items), "generated": len(items), "tokens_used": 995},
            "compliance_summary": {"checked": len(items), "passed": len(items)},
            "translation_summary": {"status": "skipped: Code nodes cannot reach Gemini (no fetch in sandbox)", "titles_sent": 0},
            "quality_summary": {"checked": len(items), "threshold": 70}, "publishing_summary": {"simulated": True, "warning": "No marketplace API was called.", "records": len(items)},
            "publish_results": [], "skus": skus, "overview": []}


def _envelope(doc: dict) -> dict:
    """What the Webhook Response node really sends: the document twice, inside a wrapper."""
    return {"_respondWith": "All Incoming Items", "_responseCode": 200, "_responseData": doc, "_redirectUrl": None, "items": [{"json": doc}]}


SPECS = {"RW-1": dict(quality=82, ready=True, compliance="fail"), "RW-2": dict(quality=58, duplicate_of="RW-1", gaps=["duplicate_of:RW-1"], channels=("amazon_in",))}


@pytest.fixture()
def remote(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(store, "OUTPUT_DIR", tmp_path)
    store._jobs.clear()
    security.login_limiter.hits.clear()
    monkeypatch.setenv("CATALOGIQ_WORKBENCH_URL", URL)
    seen: list[httpx.Request] = []

    def make(handler):
        def wrapped(request):
            seen.append(request)
            return handler(request)

        wb = RemoteWorkbench(transport=httpx.MockTransport(wrapped))
        set_workbench(wb)
        return wb

    yield make, seen
    set_workbench(None)


def _answer(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json=_envelope(_document(json.loads(request.content)["items"], SPECS)))


def _login(client):
    r = client.post("/api/auth/login", json={"email": config.DEMO_EMAIL, "password": config.DEMO_PASSWORD})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _upload_and_wait(client, h, feed=FEED):
    r = client.post("/api/batches/upload", headers=h, files={"file": ("feed.csv", feed, "text/csv")})
    assert r.status_code == 202, r.text
    for _ in range(80):
        batch = client.get("/api/batches", headers=h).json()[0]
        if batch["status"] in ("completed", "failed"):
            return batch
        time.sleep(0.1)
    raise AssertionError("run did not finish")


def test_run_imports_quality_copy_and_review_items(remote):
    make, seen = remote
    make(_answer)
    from main import app

    with TestClient(app) as client:
        h = _login(client)
        batch = _upload_and_wait(client, h)
        assert batch["status"] == "completed", batch
        assert batch["stage_total"] == len(remote_module.SECTIONS)
        products = {p["sku"]: p for p in client.get("/api/products?q=RW-", headers=h).json()["items"]}
        assert products["RW-1"]["quality_score"] == 82 and products["RW-2"]["quality_score"] == 58
        one = client.get(f"/api/products/{products['RW-1']['id']}", headers=h).json()
        assert one["status"] == "ready"
        assert one["score_detail"]["identity"] == 20 and one["score_detail"]["description"] == 13
        by_platform = {c["platform_key"]: c for c in one["content"]}
        assert by_platform["amazon_in"]["description"] == "amazon_in copy for RW-1." and by_platform["amazon_in"]["title"] == "amazon_in title for RW-1"
        assert by_platform["amazon_in"]["bullets"] == ["First point.", "Second point.", "Third point."] and by_platform["amazon_in"]["simulated"] is False
        assert all(by_platform[k]["simulated"] is False for k in CHANNELS if k in by_platform)
        assert one["review"] and "banned_term" in one["review"]["reason"]  # the warn-level violation alone would not have raised one
        two = client.get(f"/api/products/{products['RW-2']['id']}", headers=h).json()
        assert two["status"] == "in_enrichment" and "Possible duplicate of RW-1" in two["review"]["reason"]
        assert two["gate_blocked"] is True and "duplicate" in two["gate_reason"]  # the workflow holds it even though 58 is not the only reason
        assert {c["platform_key"]: c["simulated"] for c in two["content"]}["amazon_in"] is False
        assert all(c["simulated"] is True for c in two["content"] if c["platform_key"] != "amazon_in")  # channels the workflow did not write stay Simulated
        assert "attributes" not in two["score_detail"] and two["score_detail"]["identity"] == 20  # parts that did not run are left out, not scored 0
        assert two["images"][0]["quality_score"] == 50  # 1 of the 2 checked image rules met; the unchecked rule does not count
    body = seen[0].read()
    assert b'"items"' in body and b"RW-1" in body and b'"request_id"' in body


def test_the_key_is_sent_in_the_configured_header(remote, monkeypatch):
    make, seen = remote
    monkeypatch.setenv("CATALOGIQ_WORKBENCH_KEY", "s3cret")
    monkeypatch.setenv("CATALOGIQ_WORKBENCH_KEY_HEADER", "Authorization")
    monkeypatch.setenv("CATALOGIQ_WORKBENCH_KEY_SCHEME", "Bearer")
    make(_answer)
    from main import app

    with TestClient(app) as client:
        assert _upload_and_wait(client, _login(client))["status"] == "completed"
    assert seen[0].headers["authorization"] == "Bearer s3cret" and "x-catalogiq-key" not in seen[0].headers


def test_the_key_defaults_to_the_catalogiq_header(remote, monkeypatch):
    make, seen = remote
    monkeypatch.setenv("CATALOGIQ_WORKBENCH_KEY", "s3cret")
    make(_answer)
    from main import app

    with TestClient(app) as client:
        assert _upload_and_wait(client, _login(client))["status"] == "completed"
    assert seen[0].headers["x-catalogiq-key"] == "s3cret"


def test_products_are_sent_in_chunks_and_results_merged(remote, monkeypatch):
    monkeypatch.setattr(remote_module, "CHUNK", 1)
    make, seen = remote
    make(_answer)
    from main import app

    with TestClient(app) as client:
        h = _login(client)
        batch = _upload_and_wait(client, h)
        assert batch["status"] == "completed" and batch["total"] == 2
    assert len(seen) == 2 and all(len(json.loads(r.content)["items"]) == 1 for r in seen)


def _no_descriptions(request: httpx.Request) -> httpx.Response:
    doc = _document(json.loads(request.content)["items"], SPECS)
    doc["description_summary"] = {"products_sent": 2, "generated": 0, "insufficient_facts": 0, "parse_error": None}
    for s in doc["skus"]:
        s["descriptions"], s["description_status"] = {}, "not_generated"
    return httpx.Response(200, json=_envelope(doc))


def test_a_chunk_without_any_descriptions_is_sent_again_once(remote, monkeypatch):
    monkeypatch.setattr(remote_module, "RETRY_WAIT", 0)
    make, seen = remote
    make(lambda request: _no_descriptions(request) if len(seen) == 1 else _answer(request))
    from main import app

    with TestClient(app) as client:
        h = _login(client)
        assert _upload_and_wait(client, h)["status"] == "completed"
        one = client.get("/api/products?q=RW-1", headers=h).json()["items"][0]
        detail = client.get(f"/api/products/{one['id']}", headers=h).json()
        assert {c["platform_key"]: c["simulated"] for c in detail["content"]}["amazon_in"] is False  # the second answer was used
    assert len(seen) == 2 and b"-retry1" in seen[1].read()


def test_retrying_is_limited_and_the_last_answer_is_kept(remote, monkeypatch):
    monkeypatch.setattr(remote_module, "RETRY_WAIT", 0)
    make, seen = remote
    make(_no_descriptions)
    from main import app

    with TestClient(app) as client:
        h = _login(client)
        assert _upload_and_wait(client, h)["status"] == "completed"  # products are still imported, with Simulated drafts
    assert len(seen) == 2


def test_a_later_chunk_failing_keeps_the_earlier_products(remote, monkeypatch):
    monkeypatch.setattr(remote_module, "CHUNK", 1)
    make, _ = remote
    calls = []

    def flaky(request):
        calls.append(1)
        return _answer(request) if len(calls) == 1 else httpx.Response(502, text="bad gateway")

    make(flaky)
    from main import app

    with TestClient(app) as client:
        h = _login(client)
        batch = _upload_and_wait(client, h)
        assert batch["status"] == "failed" and "502" in batch["error"] and "Kept the first 1" in batch["error"]
        assert [p["sku"] for p in client.get("/api/products?q=RW-", headers=h).json()["items"]] == ["RW-1"]


def test_flagged_products_go_to_review_without_copy(remote):
    make, _ = remote
    make(lambda request: httpx.Response(200, json=_envelope(_document(json.loads(request.content)["items"], {"RW-2": dict(flagged=True)}))))
    from main import app

    with TestClient(app) as client:
        h = _login(client)
        assert _upload_and_wait(client, h)["flagged"] == 1
        flagged = client.get("/api/products?q=RW-2", headers=h).json()["items"][0]
        detail = client.get(f"/api/products/{flagged['id']}", headers=h).json()
        assert detail["status"] == "flagged" and detail["review"] and detail["quality_score"] is None


def test_http_error_fails_the_batch_without_leaking_the_address(remote):
    make, _ = remote
    make(lambda request: httpx.Response(500, text="boom"))
    from main import app

    with TestClient(app) as client:
        h = _login(client)
        batch = _upload_and_wait(client, h)
        assert batch["status"] == "failed"
        assert "500" in batch["error"] and "secret-path" not in batch["error"]
        wb = client.get("/api/workbench", headers=h).json()["connection"]
        assert "secret-path" not in wb["endpoint"] and wb["status"] == "unreachable"


def test_timeout_bad_json_and_unarmed_test_url_are_reported(remote):
    make, _ = remote
    from main import app

    def timeout(request):
        raise httpx.ReadTimeout("slow", request=request)

    make(timeout)
    with TestClient(app) as client:
        h = _login(client)
        assert "did not finish in time" in _upload_and_wait(client, h)["error"]
        make(lambda request: httpx.Response(200, text="<html>not json</html>"))
        assert "did not return JSON" in _upload_and_wait(client, h)["error"]
        make(lambda request: httpx.Response(200, json={"hello": "world"}))
        assert "not a catalogiq.result" in _upload_and_wait(client, h)["error"]
        make(lambda request: httpx.Response(200, json={"mode": "trigger-test", "body": {}}))
        assert "Run Workflow" in _upload_and_wait(client, h)["error"]


def test_a_run_lost_to_a_restart_fails(remote):
    make, _ = remote
    wb = make(_answer)
    store.save(dict(job_id="aaaaaaaaaaaa", file_name="x.csv", status="running", created_at="t", finished_at=None, error=None, stages=[], results=None, remote=True))
    run = wb.get_run("aaaaaaaaaaaa")
    assert run["status"] == "failed" and "restarted" in run["error"]
    assert wb.get_results("aaaaaaaaaaaa")["skus"] == []


def test_a_malformed_product_does_not_break_the_import(remote):
    make, _ = remote
    make(lambda request: httpx.Response(200, json=_envelope(_document(json.loads(request.content)["items"], {"RW-2": dict(broken=True)}))))
    from main import app

    with TestClient(app) as client:
        h = _login(client)
        batch = _upload_and_wait(client, h)
        assert batch["status"] == "completed", batch  # the batch finishes, and the pages that sync batches keep working
        assert client.get("/api/overview", headers=h).status_code == 200
        broken = client.get("/api/products?q=RW-2", headers=h).json()["items"][0]
        assert broken["name"] == "RW-2" and broken["status"] == "flagged"  # the unusable name falls back to the sku

import time

import pytest
from fastapi.testclient import TestClient

import config
from auth import security
from pipeline import store


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(store, "OUTPUT_DIR", tmp_path)
    store._jobs.clear()
    security.login_limiter.hits.clear()
    from main import app

    with TestClient(app) as c:
        yield c


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _login(client, email=config.DEMO_EMAIL, password=config.DEMO_PASSWORD):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return _auth(r.json()["token"])


def _signup(client, email="owner@other.example"):
    r = client.post("/api/auth/signup", json={"name": "Olive Owner", "email": email, "password": "Str0ng!Pass1", "company": "Other Foods"})
    assert r.status_code in (200, 201), r.text
    return _auth(r.json()["token"])


def test_requires_auth(client):
    assert client.get("/api/overview").status_code == 401
    assert client.get("/api/products").status_code == 401


def test_login_rejects_bad_password(client):
    r = client.post("/api/auth/login", json={"email": config.DEMO_EMAIL, "password": "wrong-password"})
    assert r.status_code == 401


def test_signup_duplicate_email_rejected(client):
    _signup(client)
    r = client.post("/api/auth/signup", json={"name": "Olive Owner", "email": "owner@other.example", "password": "Str0ng!Pass1", "company": "Other Foods"})
    assert r.status_code == 409


def test_demo_data_endpoints(client):
    h = _login(client)
    ov = client.get("/api/overview", headers=h).json()
    assert ov["counts"]["total"] == 240
    assert ov["workspace"]["is_demo"] is True
    for url in ["/api/products?limit=5", "/api/products/facets", "/api/batches", "/api/review", "/api/platforms", "/api/platforms/coverage", "/api/publishing",
                "/api/performance/summary", "/api/performance/listings", "/api/performance/ab-tests", "/api/rules", "/api/workbench", "/api/reports/summary", "/api/team"]:
        assert client.get(url, headers=h).status_code == 200, url


def test_product_detail_has_per_platform_content_and_images(client):
    h = _login(client)
    pid = client.get("/api/products?status=live&limit=1", headers=h).json()["items"][0]["id"]
    d = client.get(f"/api/products/{pid}", headers=h).json()
    assert len({c["platform_key"] for c in d["content"]}) >= 2
    assert client.get(f"/api/products/{pid}/image/front.svg", headers=h).headers["content-type"].startswith("image/svg")


def test_tenant_isolation(client):
    demo = _login(client)
    other = _signup(client)
    demo_pid = client.get("/api/products?limit=1", headers=demo).json()["items"][0]["id"]
    assert client.get(f"/api/products/{demo_pid}", headers=other).status_code == 404
    assert client.get("/api/products", headers=other).json()["total"] == 0
    assert client.get("/api/rules", headers=other).json() == []


def test_viewer_cannot_write(client):
    h = _login(client, "viewer@acmefoods.example")
    assert client.post("/api/review/bulk", headers=h, json={"ids": [1], "decision": "approve"}).status_code == 403
    assert client.post("/api/rules", headers=h, json={"region": "ALL", "kind": "restricted_claim", "value": "miracle"}).status_code == 403


def test_rule_tester_flags_restricted_claim(client):
    h = _login(client)
    client.post("/api/rules", headers=h, json={"region": "ALL", "kind": "restricted_claim", "value": "miracle cure", "note": "medical claim"})
    r = client.post("/api/rules/test", headers=h, json={"text": "A miracle cure for hunger"}).json()
    assert r["passed"] is False and r["findings"][0]["match"].lower() == "miracle cure"


def test_upload_feed_creates_batch_through_workbench(client):
    h = _login(client)
    before = len(client.get("/api/batches", headers=h).json())
    r = client.post("/api/batches/sample", headers=h)
    assert r.status_code == 202, r.text
    for _ in range(80):
        batches = client.get("/api/batches", headers=h).json()
        if batches[0]["status"] in ("completed", "done", "failed"):
            break
        time.sleep(0.15)
    assert len(batches) == before + 1
    assert batches[0]["status"] != "failed", batches[0]


def test_seed_is_deterministic(tmp_path, monkeypatch):
    from db.core import init_db, session
    from seed.demo import seed_workspace

    counts = []
    for i in range(2):
        monkeypatch.setattr(config, "DB_PATH", tmp_path / f"seed{i}.db")
        init_db()
        with session() as conn:
            wid = conn.execute("INSERT INTO workspaces (name, created_at) VALUES ('W', 'x')").lastrowid
            seed_workspace(conn, wid)
            counts.append(tuple(conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("products", "listings", "performance_daily")))
    assert counts[0] == counts[1] and counts[0][0] == 240


def test_demo_login_as_each_role(client):
    for role in ("admin", "manager", "viewer"):
        assert client.post(f"/api/auth/demo?role={role}").json()["me"]["role"] == role


def test_admin_manages_team_and_new_role_applies(client):
    admin = _login(client)
    r = client.post("/api/team", headers=admin, json={"name": "Nina New", "email": "nina@acmefoods.example", "role": "viewer"})
    assert r.status_code == 201
    uid, temp = r.json()["id"], r.json()["temporary_password"]
    nina = _login(client, "nina@acmefoods.example", temp)
    assert client.post("/api/rules", headers=nina, json={"region": "ALL", "kind": "restricted_claim", "value": "miracle"}).status_code == 403
    assert client.patch(f"/api/team/{uid}", headers=admin, json={"role": "admin"}).status_code == 200
    assert client.post("/api/rules", headers=nina, json={"region": "ALL", "kind": "restricted_claim", "value": "miracle"}).status_code == 201
    assert client.delete(f"/api/team/{uid}", headers=admin).status_code == 200


def test_manager_cannot_manage_team(client):
    h = _login(client, "manager@acmefoods.example")
    assert client.post("/api/team", headers=h, json={"name": "X Y", "email": "x@y.example", "role": "viewer"}).status_code == 403

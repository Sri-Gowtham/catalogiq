"""Cookie sessions, password reset, contact requests and the upload quota."""
import pytest
from fastapi.testclient import TestClient

import config
from auth import security
from pipeline import store

CSRF = {"X-Requested-With": "catalogiq"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(store, "OUTPUT_DIR", tmp_path)
    store._jobs.clear()
    for limiter in (security.login_limiter, security.reset_limiter, security.contact_limiter):
        limiter.hits.clear()
    from main import app

    with TestClient(app) as c:
        yield c


def _sign_in(client, email=config.DEMO_EMAIL, password=config.DEMO_PASSWORD):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r


def test_login_sets_an_httponly_cookie_that_reads_but_needs_a_header_to_write(client):
    cookie = _sign_in(client).headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert client.get("/api/overview").status_code == 200  # the cookie alone, no Authorization header
    assert client.post("/api/notifications/read").status_code == 403  # a browser write without the app's header is refused
    assert client.post("/api/notifications/read", headers=CSRF).status_code == 200


def test_cookie_is_marked_secure_when_configured(client, monkeypatch):
    monkeypatch.setattr(config, "COOKIE_SECURE", True)
    assert "secure" in _sign_in(client).headers["set-cookie"].lower()


def test_logout_clears_the_session(client):
    _sign_in(client)
    assert client.get("/api/overview").status_code == 200
    client.post("/api/auth/logout")
    assert client.get("/api/overview").status_code == 401


def test_bearer_tokens_still_work_without_the_header(client):
    token = _sign_in(client).json()["token"]
    client.cookies.clear()
    assert client.post("/api/notifications/read", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_role_change_applies_to_cookie_sessions_immediately(client):
    _sign_in(client, "viewer@acmefoods.example")
    assert client.post("/api/rules", headers=CSRF, json={"region": "ALL", "kind": "restricted_claim", "value": "probe"}).status_code == 403


def test_forgot_and_reset_password_flow(client, monkeypatch):
    monkeypatch.setattr(config, "DEV_RESET_LINKS", True)
    unknown = client.post("/api/auth/forgot", json={"email": "nobody@nowhere.example"}).json()
    known = client.post("/api/auth/forgot", json={"email": "viewer@acmefoods.example"}).json()
    assert unknown["message"] == known["message"] and "reset_link" not in unknown  # no hint about which emails exist
    token = known["reset_link"].split("token=")[1]
    assert client.post("/api/auth/reset", json={"token": token, "password": "short"}).status_code == 422
    assert client.post("/api/auth/reset", json={"token": token, "password": "BrandNew#Pass1"}).status_code == 200
    assert client.post("/api/auth/reset", json={"token": token, "password": "Another#Pass2"}).status_code == 400  # single use
    assert client.post("/api/auth/login", json={"email": "viewer@acmefoods.example", "password": config.DEMO_PASSWORD}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "viewer@acmefoods.example", "password": "BrandNew#Pass1"}).status_code == 200


def test_reset_link_is_not_returned_unless_the_dev_flag_is_on(client):
    assert "reset_link" not in client.post("/api/auth/forgot", json={"email": "viewer@acmefoods.example"}).json()


def test_expired_reset_token_is_rejected(client, monkeypatch):
    from db.core import session

    monkeypatch.setattr(config, "DEV_RESET_LINKS", True)
    token = client.post("/api/auth/forgot", json={"email": "viewer@acmefoods.example"}).json()["reset_link"].split("token=")[1]
    with session() as conn:
        conn.execute("UPDATE password_resets SET expires_at = '2000-01-01T00:00:00+00:00'")
    assert client.post("/api/auth/reset", json={"token": token, "password": "BrandNew#Pass1"}).status_code == 400


def test_a_made_up_reset_token_is_rejected(client):
    assert client.post("/api/auth/reset", json={"token": "x" * 43, "password": "BrandNew#Pass1"}).status_code == 400


def test_contact_request_is_stored_validated_and_rate_limited(client):
    from db.core import session

    ok = client.post("/api/contact", json={"name": "Priya Buyer", "email": "priya@retail.example", "sku_range": "500-5,000", "message": "Demo please"})
    assert ok.status_code == 201
    assert client.post("/api/contact", json={"name": "X Y", "email": "not-an-email"}).status_code == 422
    with session() as conn:
        assert conn.execute("SELECT COUNT(*) FROM leads WHERE email = 'priya@retail.example'").fetchone()[0] == 1
    codes = [client.post("/api/contact", json={"name": "Spam Bot", "email": f"s{i}@x.example"}).status_code for i in range(6)]
    assert 429 in codes


def test_upload_quota_limits_feeds_per_workspace(client, monkeypatch):
    monkeypatch.setattr(config, "UPLOADS_PER_HOUR", 1)
    token = _sign_in(client).json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    assert client.post("/api/batches/sample", headers=h).status_code == 202
    second = client.post("/api/batches/sample", headers=h)
    assert second.status_code == 429 and "limit" in second.json()["detail"].lower()


def test_security_headers_are_present(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"


def test_session_endpoint_is_200_whether_or_not_you_are_signed_in(client):
    assert client.get("/api/auth/session").json() is None
    _sign_in(client)
    assert client.get("/api/auth/session").json()["email"] == config.DEMO_EMAIL
    client.post("/api/auth/logout")
    assert client.get("/api/auth/session").json() is None

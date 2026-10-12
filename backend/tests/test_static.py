"""The API can serve the built web app. These tests build a tiny fake site and check the routing and the safety rules."""
import importlib

import pytest
from fastapi.testclient import TestClient

import config


@pytest.fixture()
def site(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html><div id='root'>CatalogIQ shell</div></html>", encoding="utf-8")
    (dist / "assets" / "app-abc123.js").write_text("console.log('app')", encoding="utf-8")
    (dist / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("top secret", encoding="utf-8")  # sits beside dist, must never be served
    monkeypatch.setattr(config, "STATIC_DIR", dist)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "test.db")
    import main

    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client
    monkeypatch.undo()
    importlib.reload(main)  # leave the module as the other tests expect it


def test_the_shell_is_served_for_the_root_and_for_deep_links(site):
    for path in ("/", "/login", "/app/catalog", "/app/products/161"):
        r = site.get(path)
        assert r.status_code == 200 and "CatalogIQ shell" in r.text, path


def test_assets_and_public_files_are_served_as_themselves(site):
    assert site.get("/assets/app-abc123.js").text == "console.log('app')"
    assert site.get("/favicon.svg").text == "<svg/>"


def test_unknown_api_paths_are_json_404s_not_the_shell(site):
    r = site.get("/api/does-not-exist")
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")
    assert site.get("/api/health").json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt", "/....//secret.txt"])
def test_files_outside_the_build_folder_are_never_served(site, path):
    r = site.get(path)
    assert "top secret" not in r.text

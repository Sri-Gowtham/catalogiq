"""Workbench that runs the agents in the SNS n8n workflow, reached through one webhook.

The workflow's trigger answers only when its last node finishes, so one HTTP call stays open for the whole run (a Gemini
step is included, so minutes). A run therefore works like the local one: a background thread makes the call, and `get_run`
reports "running" until it returns. There is no per-agent progress while waiting; the stages are read from the response.

Settings (environment only; the webhook address is a secret and is never logged or shown):
  CATALOGIQ_WORKBENCH=remote
  CATALOGIQ_WORKBENCH_URL       full webhook address
  CATALOGIQ_WORKBENCH_KEY       optional secret, sent in a header (default X-CatalogIQ-Key)
  CATALOGIQ_WORKBENCH_KEY_HEADER  header name, for a webhook that expects another one (for example Authorization)
  CATALOGIQ_WORKBENCH_KEY_SCHEME  optional prefix for the value (for example Bearer)
  CATALOGIQ_WORKBENCH_TIMEOUT   seconds to wait for each call (default 900)
  CATALOGIQ_WORKBENCH_RETRIES   times a chunk is sent again when the model step produced no descriptions at all (default 1)
  CATALOGIQ_WORKBENCH_CHUNK     products per call (default 3: the description step is set to 3 at a time, about 35 s per call)
"""
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from agents.ingestion import ingest_feed
from pipeline import runner, store
from pipeline.registry import AGENTS

SCHEMA_PREFIX = "catalogiq.result."

# response summary -> platform agent id (so names and layers resolve like the local pipeline). Modes follow the workflow author's
# statement: rule-based checks and Gemini descriptions are real; competitive, attribute extraction, translation and publishing are not.
SECTIONS = [
    ("ingest_summary", "ingestion", "live"),
    ("audit_summary", "audit", "live"),
    ("duplicate_summary", "duplicate_detector", "live"),
    ("image_summary", "image_analysis", "live"),
    ("attribute_extraction_summary", "attribute_extraction", "simulated"),
    ("taxonomy_summary", "taxonomy", "live"),
    ("competitive_summary", "competitive_intel", "simulated"),
    ("description_summary", "channel_content", "live"),
    ("compliance_summary", "brand_compliance", "live"),
    ("translation_summary", "translation", "simulated"),
    ("quality_summary", "quality_gate", "live"),
    ("publishing_summary", "publishing", "simulated"),
]
CHUNK = max(1, int(os.environ.get("CATALOGIQ_WORKBENCH_CHUNK", "3")))  # the description step is set to 3 products per call
RETRIES = max(0, int(os.environ.get("CATALOGIQ_WORKBENCH_RETRIES", "1")))
RETRY_WAIT = float(os.environ.get("CATALOGIQ_WORKBENCH_RETRY_WAIT", "8"))  # seconds; the model API's "high demand" errors are usually short
_active: set[str] = set()  # runs that have a live thread in this process
_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _int(v) -> int:
    return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else 0


def _stage(agent_id: str, mode: str, status: str, summary: dict | None = None, note: str = "") -> dict:
    s = summary if isinstance(summary, dict) else {}
    name = next((a.name for a in AGENTS if a.id == agent_id), agent_id)
    count = next((s[k] for k in ("processed", "checked", "total", "products_sent", "records") if k in s), None)
    text = note or next((str(s[k]) for k in ("status", "warning", "note", "message") if isinstance(s.get(k), str)), "")
    return dict(id=agent_id, name=name, mode=mode, status=status, started_at=None, duration_ms=None,
                processed=_int(count), skipped=_int(s.get("skipped", s.get("skipped_over_cap"))), note=text[:200])


def _stages_from_response(chunks: list[dict]) -> list[dict]:
    """One stage per summary, with counts added up over the chunks of a run."""
    stages = []
    for key, aid, mode in SECTIONS:
        parts = [_stage(aid, mode, "done", c.get(key)) for c in chunks]
        first = parts[0]
        first["processed"] = sum(p["processed"] for p in parts)
        first["skipped"] = sum(p["skipped"] for p in parts)
        stages.append(first)
    return stages


def _descriptions_failed(doc: dict) -> bool:
    """The model step was asked for descriptions and returned none, and not because the products lacked facts."""
    s = doc.get("description_summary")
    return isinstance(s, dict) and _int(s.get("products_sent")) > 0 and _int(s.get("generated")) == 0 and _int(s.get("insufficient_facts")) == 0


def _unwrap(body):
    """The workflow answers {"_responseData": {document}, "items": [{"json": {document}}], ...}; older shapes are tolerated."""
    if isinstance(body, list) and body and isinstance(body[0], dict):
        body = body[0]
    if isinstance(body, dict):
        if isinstance(body.get("_responseData"), dict):
            return body["_responseData"]
        items = body.get("items")
        if isinstance(items, list) and items and isinstance(items[0], dict) and isinstance(items[0].get("json"), dict):
            return items[0]["json"]
        if isinstance(body.get("body"), dict) and "skus" in body["body"]:
            return body["body"]
    return body


class RemoteWorkbench:
    name = "SNS Agent Workbench (n8n)"

    def __init__(self, transport: httpx.BaseTransport | None = None) -> None:
        self._url = os.environ.get("CATALOGIQ_WORKBENCH_URL", "").strip()
        self._key = os.environ.get("CATALOGIQ_WORKBENCH_KEY", "").strip()
        self._key_header = os.environ.get("CATALOGIQ_WORKBENCH_KEY_HEADER", "").strip() or "X-CatalogIQ-Key"
        self._key_scheme = os.environ.get("CATALOGIQ_WORKBENCH_KEY_SCHEME", "").strip()
        self._timeout = float(os.environ.get("CATALOGIQ_WORKBENCH_TIMEOUT", "900"))
        self._transport = transport
        self._last_ok: str | None = None
        self._last_error: str | None = None
        parts = urlsplit(self._url)
        # show the host only: the path of the address is the secret
        self.endpoint = f"{parts.scheme}://{parts.netloc}/…" if parts.netloc else "not configured"
        self.stage_total = len(SECTIONS)

    # ------------------------------------------------------------ status
    def health(self) -> dict:
        if not self._url:
            return {"status": "unreachable", "detail": "CATALOGIQ_WORKBENCH_URL is not set."}
        if self._last_error:
            return {"status": "unreachable", "detail": f"The last run failed: {self._last_error}"}
        if self._last_ok:
            return {"status": "connected", "detail": f"Last run answered at {self._last_ok}."}
        return {"status": "connected", "detail": "Configured. Not called yet (each call spends model credit, so it is not probed)."}

    def list_agents(self) -> list[dict]:
        modes = {aid: mode for _, aid, mode in SECTIONS}
        out = []
        for a in AGENTS:
            if a.id in modes:
                out.append(dict(id=a.id, name=a.name, layer=a.layer, mode=modes[a.id], description=a.description, in_pipeline=True))
        return out

    # ------------------------------------------------------------ runs
    def submit_run(self, file_path: Path, file_name: str) -> str:
        if not self._url:
            raise RuntimeError("The workbench address is not configured (CATALOGIQ_WORKBENCH_URL).")
        run_id = runner.new_job_id()
        ingest = ingest_feed(Path(file_path))
        job = dict(job_id=run_id, file_name=file_name, status="running", created_at=_now(), finished_at=None, error=None,
                   stages=[_stage("workflow", "live", "running", None, "Waiting for the agent workflow to finish.")], results=None, remote=True)
        job["stages"][0]["name"] = "Agent workflow"
        job["stages"][0]["started_at"] = _now()
        store.save(job)
        with _lock:
            _active.add(run_id)
        threading.Thread(target=self._run, args=(run_id, ingest), daemon=True).start()
        return run_id

    def _run(self, run_id: str, ingest: dict) -> None:
        job = store.get(run_id)
        started = time.perf_counter()
        items = [r["raw_record"] for r in ingest["records"]]
        chunks: list[dict] = []
        try:
            for i in range(0, len(items), CHUNK):
                part, rid = items[i:i + CHUNK], f"{run_id}-{i // CHUNK + 1}"
                doc = self._call(part, rid)
                for attempt in range(RETRIES):  # a temporary model error ends the description step for the whole chunk, so ask once more
                    if not _descriptions_failed(doc):
                        break
                    time.sleep(RETRY_WAIT)
                    doc = self._call(part, f"{rid}-retry{attempt + 1}")
                chunks.append(doc)
                stage = job["stages"][0]
                stage["processed"] = min(i + CHUNK, len(items))
                stage["note"] = f"{stage['processed']} of {len(items)} products done."
                store.save(job)
            job["results"] = self._results(ingest, chunks)
            job["stages"] = _stages_from_response(chunks) if chunks else [_stage("ingestion", "live", "done", ingest["summary"])]
            job["status"] = "completed"
            self._last_ok, self._last_error = _now(), None
        except Exception as exc:  # reported on the batch; the address is never included
            job["status"] = "failed"
            job["error"] = self._describe(exc) + (f" Kept the first {len(chunks) * CHUNK} products." if chunks else "")
            job["stages"][0]["status"] = "failed"
            job["stages"][0]["note"] = job["error"]
            job["results"] = self._results(ingest, chunks)  # products that were already answered are still imported
            self._last_error = job["error"]
        finally:
            if job["stages"] and job["stages"][0].get("id") == "workflow":
                job["stages"][0]["duration_ms"] = round((time.perf_counter() - started) * 1000)
            job["finished_at"] = _now()
            store.save(job)
            with _lock:
                _active.discard(run_id)

    def _call(self, items: list[dict], request_id: str) -> dict:
        headers = {self._key_header: f"{self._key_scheme} {self._key}".strip()} if self._key else {}
        with httpx.Client(transport=self._transport, timeout=httpx.Timeout(self._timeout, connect=15.0)) as client:
            resp = client.post(self._url, json={"items": items, "request_id": request_id}, headers=headers)  # echoed back, so a run can be matched to a batch
        if resp.status_code >= 300:
            raise RuntimeError(f"The workflow answered HTTP {resp.status_code}.")
        try:
            data = _unwrap(resp.json())
        except ValueError as exc:
            raise RuntimeError("The workflow did not return JSON.") from exc
        if isinstance(data, dict) and data.get("mode") == "trigger-test":
            raise RuntimeError("The test webhook answered without running the workflow (click Run Workflow in the builder first).")
        if not isinstance(data, dict) or not str(data.get("schema_version", "")).startswith(SCHEMA_PREFIX) or not isinstance(data.get("skus"), list):
            raise RuntimeError("The workflow answer is not a catalogiq.result document.")
        return data

    @staticmethod
    def _describe(exc: Exception) -> str:
        if isinstance(exc, httpx.TimeoutException):
            return "The workflow did not finish in time."
        if isinstance(exc, httpx.TransportError):
            return "The workflow could not be reached."
        return str(exc) if isinstance(exc, RuntimeError) else f"{type(exc).__name__} while calling the workflow."

    @staticmethod
    def _results(ingest: dict, chunks: list[dict]) -> dict:
        skus, notes = [], []
        for data in chunks:
            for note in data.get("notes") or []:
                if note not in notes:
                    notes.append(note)
            for s in data.get("skus", []):
                if not isinstance(s, dict) or not s.get("sku_id"):
                    continue
                skus.append({**s, "normalized": s.get("normalized") or {"sku_id": s["sku_id"]}, "audit": s.get("audit"), "raw_record": s.get("raw_record") or {},
                             "skipped_reason": s.get("skipped_reason")})
        # the workflow summarises each call; over several chunks the totals are rebuilt from the products
        audits = [s["audit"] for s in skus if isinstance(s.get("audit"), dict) and isinstance(s["audit"].get("audit_score"), (int, float))]
        counts: dict[str, int] = {}
        for a in audits:
            counts[a.get("status", "?")] = counts.get(a.get("status", "?"), 0) + 1
        audit_summary = dict(total=len(audits), average_score=round(sum(a["audit_score"] for a in audits) / len(audits)) if audits else None, status_counts=counts)
        return dict(ingest_summary=ingest["summary"], ingest_errors=ingest["errors"], audit_summary=audit_summary, skus=skus, notes=notes,
                    workflow_simulated=any(bool(d.get("simulated")) for d in chunks))

    def get_run(self, run_id: str) -> dict | None:
        job = store.get(run_id)
        if job is None or not job.get("remote"):
            return None
        with _lock:
            alive = run_id in _active
        if job["status"] == "running" and not alive:  # the server restarted while the call was open
            job["status"], job["error"], job["finished_at"] = "failed", "The server restarted before the workflow answered.", _now()
            job["results"] = job.get("results") or dict(ingest_summary={}, ingest_errors=[], audit_summary={}, skus=[])
            store.save(job)
        return dict(status=job["status"], stages=job["stages"], error=job["error"], created_at=job["created_at"], finished_at=job["finished_at"])

    def get_results(self, run_id: str) -> dict | None:
        job = store.get(run_id)
        if job is None or job["status"] not in ("completed", "failed"):
            return None
        return job["results"]

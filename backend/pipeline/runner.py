"""Runs the registered pipeline agents in order and records per-stage progress."""
import time
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pipeline import store
from pipeline.context import JobContext
from pipeline.registry import pipeline_agents


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_job_id() -> str:
    return uuid.uuid4().hex[:12]


def create_job(job_id: str, file_name: str) -> dict:
    job = {
        "job_id": job_id,
        "file_name": file_name,
        "status": "queued",
        "created_at": _now(),
        "finished_at": None,
        "error": None,
        "stages": [
            {
                "id": a.id,
                "name": a.name,
                "layer": a.layer,
                "mode": a.mode,
                "status": "pending",
                "started_at": None,
                "duration_ms": None,
                "processed": 0,
                "skipped": 0,
                "note": "",
            }
            for a in pipeline_agents()
        ],
        "results": None,
    }
    store.save(job)
    return job


def build_results(ctx: JobContext) -> dict:
    skus = []
    for record in ctx.records:
        normalized = {k: v for k, v in record.items() if k != "raw_record"}
        skus.append(
            {
                "sku_id": record["sku_id"],
                "product_name": record["product_name"],
                "raw_record": record["raw_record"],
                "normalized": normalized,
                "audit": ctx.audit_results.get(record["sku_id"]),
                "skipped_reason": ctx.skipped.get(record["sku_id"]),
            }
        )
    return {
        "ingest_summary": ctx.ingest_summary,
        "ingest_errors": ctx.ingest_errors,
        "audit_summary": ctx.audit_summary,
        "skus": skus,
    }


def run_job(job_id: str, file_path: Path, file_name: str) -> None:
    job = store.get(job_id)
    if job is None:
        return
    ctx = JobContext(job_id=job_id, file_path=file_path, file_name=file_name)
    job["status"] = "running"
    store.save(job)

    agents = {a.id: a for a in pipeline_agents()}
    try:
        for stage in job["stages"]:
            stage["status"] = "running"
            stage["started_at"] = _now()
            store.save(job)

            started = time.perf_counter()
            try:
                result = agents[stage["id"]].run(ctx)
            except Exception as exc:  # a failed agent stops the run but is reported, not raised
                stage["status"] = "failed"
                stage["note"] = f"{type(exc).__name__}: {exc}"
                stage["duration_ms"] = round((time.perf_counter() - started) * 1000)
                raise
            stage["duration_ms"] = round((time.perf_counter() - started) * 1000)
            stage["status"] = "done"
            stage["processed"] = result.processed
            stage["skipped"] = result.skipped
            stage["note"] = result.note
            stage["mode"] = "simulated" if result.simulated else stage["mode"]
            store.save(job)
        job["status"] = "completed"
    except Exception as exc:
        job["status"] = "failed"
        job["error"] = f"{type(exc).__name__}: {exc}"
        traceback.print_exc()
    finally:
        job["results"] = build_results(ctx)
        job["finished_at"] = _now()
        store.save(job)

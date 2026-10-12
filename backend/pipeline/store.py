"""Job store: in-memory index backed by output/{job_id}/job.json so runs survive a restart."""
import json
import re
import threading

from config import OUTPUT_DIR

_JOB_ID_RE = re.compile(r"^[a-f0-9]{12}$")
_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def valid_job_id(job_id: str) -> bool:
    return bool(_JOB_ID_RE.match(job_id))


def job_dir(job_id: str):
    return OUTPUT_DIR / job_id


def save(job: dict) -> None:
    with _lock:
        _jobs[job["job_id"]] = job
        directory = job_dir(job["job_id"])
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "job.json").write_text(json.dumps(job, indent=2, default=str), encoding="utf-8")


def get(job_id: str) -> dict | None:
    if not valid_job_id(job_id):
        return None
    with _lock:
        job = _jobs.get(job_id)
    if job is not None:
        return job
    path = job_dir(job_id) / "job.json"
    if path.is_file():
        job = json.loads(path.read_text(encoding="utf-8"))
        with _lock:
            _jobs[job_id] = job
        return job
    return None

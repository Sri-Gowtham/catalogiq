"""In-process workbench: runs the agents of this repository (backend/agents + backend/pipeline)."""
import threading
from pathlib import Path

from pipeline import runner, store
from pipeline.registry import AGENTS


class LocalWorkbench:
    name = "Local agent pipeline"
    endpoint = "in-process"

    def health(self) -> dict:
        return {"status": "connected", "detail": "Agents run inside this server."}

    def list_agents(self) -> list[dict]:
        return [dict(id=a.id, name=a.name, layer=a.layer, mode=a.mode, description=a.description, in_pipeline=a.in_pipeline) for a in AGENTS]

    def submit_run(self, file_path: Path, file_name: str) -> str:
        run_id = runner.new_job_id()
        runner.create_job(run_id, file_name)
        # copy the input next to the run's output, as the upload route always did
        target = store.job_dir(run_id) / f"input{Path(file_name).suffix.lower()}"
        target.write_bytes(Path(file_path).read_bytes())
        threading.Thread(target=runner.run_job, args=(run_id, target, file_name), daemon=True).start()
        return run_id

    def get_run(self, run_id: str) -> dict | None:
        job = store.get(run_id)
        if job is None:
            return None
        return dict(status=job["status"], stages=job["stages"], error=job["error"], created_at=job["created_at"], finished_at=job["finished_at"])

    def get_results(self, run_id: str) -> dict | None:
        job = store.get(run_id)
        if job is None or job["status"] not in ("completed", "failed"):
            return None
        return job["results"]

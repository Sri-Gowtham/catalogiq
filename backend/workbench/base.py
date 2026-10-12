"""The contract between the platform and whatever runs the agents.

The platform only ever talks to a `Workbench`. Today that is the in-process pipeline (LocalWorkbench).
The SNS Square Agent Workbench is a second implementation of the same interface (RemoteWorkbench), added once
its API details are known. Nothing else in the platform changes when it is switched on.
"""
from pathlib import Path
from typing import Protocol


class Workbench(Protocol):
    name: str          # shown on the Integrations page
    endpoint: str      # where the agents run

    def health(self) -> dict:
        """{"status": "connected" | "unreachable", "detail": str}"""

    def list_agents(self) -> list[dict]:
        """Each: id, name, layer, mode ("live" | "simulated"), description, in_pipeline."""

    def submit_run(self, file_path: Path, file_name: str) -> str:
        """Start a pipeline run on a feed file and return a run id."""

    def get_run(self, run_id: str) -> dict | None:
        """Status and per-stage progress: {status, stages: [{id, name, mode, status, duration_ms, processed, skipped, note}], error}."""

    def get_results(self, run_id: str) -> dict | None:
        """Finished-run output: {ingest_summary, ingest_errors, audit_summary, skus: [...]}; None until the run has finished."""

"""Placeholder for the SNS Square Agent Workbench.

Not implemented on purpose: its API (authentication, run submission, status and result endpoints) is not known yet.
Once those details are available, implement the five methods of `workbench.base.Workbench` here, using
`CATALOGIQ_WORKBENCH_URL` and `CATALOGIQ_WORKBENCH_KEY`, then set `CATALOGIQ_WORKBENCH=remote`.
"""
import os
from pathlib import Path


class RemoteWorkbench:
    name = "SNS Square Agent Workbench"

    def __init__(self) -> None:
        self.endpoint = os.environ.get("CATALOGIQ_WORKBENCH_URL", "not configured")

    def health(self) -> dict:
        return {"status": "unreachable", "detail": "The remote workbench adapter is not implemented yet."}

    def list_agents(self) -> list[dict]:
        raise NotImplementedError("RemoteWorkbench.list_agents: waiting for the workbench API details")

    def submit_run(self, file_path: Path, file_name: str) -> str:
        raise NotImplementedError("RemoteWorkbench.submit_run: waiting for the workbench API details")

    def get_run(self, run_id: str) -> dict | None:
        raise NotImplementedError("RemoteWorkbench.get_run: waiting for the workbench API details")

    def get_results(self, run_id: str) -> dict | None:
        raise NotImplementedError("RemoteWorkbench.get_results: waiting for the workbench API details")

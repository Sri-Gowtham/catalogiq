"""Select the workbench the platform talks to (default: the local pipeline)."""
import os

from workbench.base import Workbench

_instance: Workbench | None = None


def get_workbench() -> Workbench:
    global _instance
    if _instance is None:
        if os.environ.get("CATALOGIQ_WORKBENCH", "local") == "remote":
            from workbench.remote import RemoteWorkbench

            _instance = RemoteWorkbench()
        else:
            from workbench.local import LocalWorkbench

            _instance = LocalWorkbench()
    return _instance


def set_workbench(wb: Workbench | None) -> None:
    """For tests: inject a fake workbench, or None to reset."""
    global _instance
    _instance = wb

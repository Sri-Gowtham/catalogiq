from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class JobContext:
    """Shared state handed from one agent to the next within a single run."""

    job_id: str
    file_path: Path
    file_name: str
    records: list[dict] = field(default_factory=list)
    ingest_errors: list[dict] = field(default_factory=list)
    ingest_summary: dict = field(default_factory=dict)
    audit_results: dict[str, dict] = field(default_factory=dict)  # sku_id -> audit result
    audit_summary: dict = field(default_factory=dict)
    skipped: dict[str, str] = field(default_factory=dict)  # sku_id -> reason it left the pipeline

    def eligible(self) -> list[dict]:
        """Records still moving through the pipeline."""
        return [r for r in self.records if r["sku_id"] not in self.skipped]


@dataclass
class StageResult:
    processed: int = 0
    skipped: int = 0
    note: str = ""
    simulated: bool = False

from typing import Any, Literal

from pydantic import BaseModel

Severity = Literal["high", "medium", "low"]
AuditStatus = Literal["PASS", "REVIEW", "FLAGGED"]
StageStatus = Literal["pending", "running", "done", "failed"]
JobStatus = Literal["queued", "running", "completed", "failed"]


class AgentInfo(BaseModel):
    id: str
    name: str
    layer: int
    mode: Literal["live", "simulated"]
    description: str
    in_pipeline: bool


class UploadResponse(BaseModel):
    job_id: str


class Stage(BaseModel):
    id: str
    name: str
    layer: int
    mode: Literal["live", "simulated"]
    status: StageStatus
    started_at: str | None
    duration_ms: int | None
    processed: int
    skipped: int
    note: str


class JobStatusResponse(BaseModel):
    job_id: str
    file_name: str
    status: JobStatus
    created_at: str
    finished_at: str | None
    error: str | None
    stages: list[Stage]


class AuditIssue(BaseModel):
    field: str
    code: str
    severity: Severity
    issue: str


class AuditBreakdown(BaseModel):
    completeness: float
    consistency: float
    coverage: float


class AuditResult(BaseModel):
    sku_id: str
    audit_score: int
    status: AuditStatus
    breakdown: AuditBreakdown
    issues: list[AuditIssue]


class TopIssue(BaseModel):
    code: str
    label: str
    count: int


class AuditSummary(BaseModel):
    total: int
    average_score: float
    status_counts: dict[AuditStatus, int]
    top_issues: list[TopIssue]


class IngestSummary(BaseModel):
    format: str
    total: int
    ok: int
    failed: int


class IngestError(BaseModel):
    row: int
    reason: str
    raw: Any


class NormalizedRecord(BaseModel):
    sku_id: str
    product_name: str | None
    brand: str | None
    category: str | None
    description: str | None
    weight_raw: str | None
    weight_value: float | None
    weight_unit: str | None
    ingredients: list[str]
    image_url: str | None
    price_usd: float | None
    country_of_origin: str | None
    source_row: int


class SkuResult(BaseModel):
    sku_id: str
    product_name: str | None
    raw_record: dict[str, Any]
    normalized: NormalizedRecord
    audit: AuditResult | None
    skipped_reason: str | None


class JobResults(BaseModel):
    ingest_summary: IngestSummary
    ingest_errors: list[IngestError]
    audit_summary: AuditSummary
    skus: list[SkuResult]

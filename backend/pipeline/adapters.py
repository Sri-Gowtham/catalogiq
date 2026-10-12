"""Thin wrappers that fit agent functions into the `run(ctx) -> StageResult` contract.

The agents themselves (backend/agents/*) stay independent of the pipeline: they
only need to keep their documented function names and return shapes.
"""
from agents.audit import audit_records
from agents.ingestion import ingest_feed
from pipeline.context import JobContext, StageResult


def ingestion_stage(ctx: JobContext) -> StageResult:
    out = ingest_feed(ctx.file_path)
    ctx.records = out["records"]
    ctx.ingest_errors = out["errors"]
    ctx.ingest_summary = out["summary"]
    note = f"{out['summary']['ok']} of {out['summary']['total']} rows normalised"
    if out["errors"]:
        note += f", {len(out['errors'])} rejected"
    return StageResult(processed=out["summary"]["ok"], skipped=len(out["errors"]), note=note)


def audit_stage(ctx: JobContext) -> StageResult:
    out = audit_records(ctx.records)
    ctx.audit_results = {r["sku_id"]: r for r in out["results"]}
    ctx.audit_summary = out["summary"]
    for result in out["results"]:
        if result["status"] == "FLAGGED":
            ctx.skipped[result["sku_id"]] = (
                f"Data quality too low (audit score {result['audit_score']}); not sent to enrichment"
            )
    flagged = out["summary"]["status_counts"]["FLAGGED"]
    return StageResult(
        processed=out["summary"]["total"],
        skipped=flagged,
        note=f"average score {out['summary']['average_score']}, {flagged} flagged",
    )


def simulated_stage(ctx: JobContext, agent_id: str) -> StageResult:
    """Stand-in for an agent that is designed but not built: passes records through unchanged."""
    eligible = len(ctx.eligible())
    return StageResult(
        processed=eligible,
        skipped=len(ctx.skipped),
        note="Simulated: not built yet, records passed through unchanged",
        simulated=True,
    )

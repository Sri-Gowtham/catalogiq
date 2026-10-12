from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile

from api import schemas
from config import ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, SAMPLE_DIR
from pipeline import runner, store
from pipeline.registry import AGENTS

router = APIRouter(prefix="/api")


def _job_or_404(job_id: str) -> dict:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _results_or_409(job: dict) -> dict:
    if job["results"] is None or job["status"] in ("queued", "running"):
        raise HTTPException(status_code=409, detail="Job has not finished yet")
    return job["results"]


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/agents", response_model=list[schemas.AgentInfo])
def list_agents():
    return [
        schemas.AgentInfo(
            id=a.id, name=a.name, layer=a.layer, mode=a.mode, description=a.description, in_pipeline=a.in_pipeline
        )
        for a in AGENTS
    ]


@router.post("/upload", response_model=schemas.UploadResponse, status_code=202)
async def upload(background: BackgroundTasks, file: UploadFile = File(...)):
    original = Path(file.filename or "").name
    extension = Path(original).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .csv and .json files are supported")

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    if not data.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    job_id = runner.new_job_id()
    runner.create_job(job_id, original)
    path = store.job_dir(job_id) / f"input{extension}"
    path.write_bytes(data)
    background.add_task(runner.run_job, job_id, path, original)
    return schemas.UploadResponse(job_id=job_id)


@router.post("/sample", response_model=schemas.UploadResponse, status_code=202)
def run_sample(background: BackgroundTasks):
    """Run the bundled messy supplier feed so the demo works without picking a file."""
    source = SAMPLE_DIR / "supplier_feed.csv"
    job_id = runner.new_job_id()
    runner.create_job(job_id, source.name)
    path = store.job_dir(job_id) / "input.csv"
    path.write_bytes(source.read_bytes())
    background.add_task(runner.run_job, job_id, path, source.name)
    return schemas.UploadResponse(job_id=job_id)


@router.get("/jobs/{job_id}/status", response_model=schemas.JobStatusResponse)
def job_status(job_id: str):
    return _job_or_404(job_id)


@router.get("/jobs/{job_id}/results", response_model=schemas.JobResults)
def job_results(job_id: str):
    return _results_or_409(_job_or_404(job_id))


@router.get("/jobs/{job_id}/skus/{sku_id}", response_model=schemas.SkuResult)
def job_sku(job_id: str, sku_id: str):
    results = _results_or_409(_job_or_404(job_id))
    for sku in results["skus"]:
        if sku["sku_id"] == sku_id:
            return sku
    raise HTTPException(status_code=404, detail="SKU not found in this job")

# CatalogIQ

AI catalog intelligence prototype (UC-49). Upload a supplier feed; CatalogIQ normalises it and audits data quality
before any AI is spent on it.

## What runs today

| Agent | Status |
|---|---|
| Feed Ingestion | Live |
| Pre-Enrichment Audit | Live |
| All other agents and the Layer 3 feedback loop | Simulated stand-ins, labelled as such in the UI |

Simulated agents pass records through unchanged until they are built. See `backend/pipeline/registry.py`.

## Run it

Backend (Python 3.12+):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m uvicorn main:app --port 8000
```

Frontend (Node 20+), in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and click **Run sample feed**. Vite proxies `/api` to the backend on port 8000.

Tests: `cd backend; .\.venv\Scripts\python -m pytest`

## How agents connect

- `backend/agents/ingestion.py` exposes `ingest_feed(path) -> {records, errors, summary}`.
- `backend/agents/audit.py` exposes `audit_records(records) -> {results, summary}`.
- `backend/pipeline/adapters.py` wraps agent functions as pipeline stages; `registry.py` lists every agent and
  whether it is live or simulated. The frontend reads that list from `GET /api/agents`.
- To add an agent: write its function, wrap it in `adapters.py`, and swap its `_simulated(...)` entry in
  `registry.py` for a live `Agent(...)`.

Run output is written to `output/<job_id>/` (git-ignored).

## Changing the API

The frontend types are generated from the backend schema. After changing `backend/api/schemas.py`, run
`npm run gen:api` in `frontend/`.

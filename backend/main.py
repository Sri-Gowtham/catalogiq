import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

import config
from api import auth_routes, catalog_routes, insight_routes, ops_routes, public_routes, workspace_routes
from db.core import init_db, session
from seed.demo import ensure_demo_account


@asynccontextmanager
async def lifespan(app: FastAPI):
    if config.PRODUCTION and not os.environ.get("CATALOGIQ_JWT_SECRET"):
        raise RuntimeError("Set CATALOGIQ_JWT_SECRET before running in production.")
    init_db()
    if config.DEMO_ENABLED:
        with session() as conn:
            ensure_demo_account(conn)
    yield


app = FastAPI(title="CatalogIQ API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


for module in (auth_routes, public_routes, workspace_routes, catalog_routes, ops_routes, insight_routes):
    app.include_router(module.router)


# The built web app, when it exists: hashed assets directly, and every other non-API path falls back to index.html
# so that links such as /app/catalog work on a hard refresh.
_dist = config.STATIC_DIR.resolve()
if (_dist / "index.html").is_file():
    if (_dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def web_app(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not found")
        candidate = (_dist / path).resolve()
        if path and candidate.is_file() and _dist in candidate.parents:  # never serve anything outside the build folder
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")

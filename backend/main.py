from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import auth_routes, catalog_routes, insight_routes, ops_routes, workspace_routes
from db.core import init_db, session
from seed.demo import ensure_demo_account


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with session() as conn:
        ensure_demo_account(conn)
    yield


app = FastAPI(title="CatalogIQ API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


for module in (auth_routes, workspace_routes, catalog_routes, ops_routes, insight_routes):
    app.include_router(module.router)

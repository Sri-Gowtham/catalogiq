import os
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output"
MOCK_DIR = ROOT / "mock"
SAMPLE_DIR = ROOT / "sample_data"

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {".csv", ".json"}

# Pre-enrichment audit thresholds
PASS_THRESHOLD = 70
REVIEW_THRESHOLD = 50

# Platform database. Tests point this somewhere temporary.
DB_PATH = Path(os.environ.get("CATALOGIQ_DB", OUTPUT_DIR / "catalogiq.db"))

# Auth
TOKEN_TTL_HOURS = 24
LOGIN_ATTEMPTS_PER_MINUTE = 8
COOKIE_NAME = "catalogiq_session"
CSRF_HEADER = "x-requested-with"  # sent by the web app on every request; cross-site pages cannot add it without a CORS preflight
CSRF_VALUE = "catalogiq"
RESET_TTL_MINUTES = 30
RESET_ATTEMPTS_PER_MINUTE = 5
CONTACT_PER_MINUTE = 3
UPLOADS_PER_HOUR = 20  # per workspace


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes"}


# Deployment switches (all read from the environment)
PRODUCTION = os.environ.get("CATALOGIQ_ENV", "").strip().lower() == "production"
DEMO_ENABLED = _flag("CATALOGIQ_ENABLE_DEMO") if "CATALOGIQ_ENABLE_DEMO" in os.environ else not PRODUCTION  # demo logins use a published password, so off in production
STATIC_DIR = Path(os.environ.get("CATALOGIQ_STATIC_DIR", ROOT / "frontend" / "dist"))  # the built web app, served by the API when present
COOKIE_SECURE = _flag("CATALOGIQ_COOKIE_SECURE")  # set when served over https
DEV_RESET_LINKS = _flag("CATALOGIQ_DEV_RESET_LINKS")  # return the reset link in the response; local demos only, never in production
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("CATALOGIQ_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]


def jwt_secret() -> str:
    """Signing key: from the environment, else one generated once and kept beside the database (git-ignored)."""
    env = os.environ.get("CATALOGIQ_JWT_SECRET")
    if env:
        return env
    path = Path(DB_PATH).parent / ".jwt_secret"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(secrets.token_hex(32), encoding="utf-8")
    return path.read_text(encoding="utf-8").strip()


# Demo workspace (fictional brand; every figure in it is sample data)
DEMO_EMAIL = "demo@acmefoods.example"
DEMO_PASSWORD = "Demo@12345"

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

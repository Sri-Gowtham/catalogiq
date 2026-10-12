"""Write the API's OpenAPI schema to frontend/openapi.json (input for `npm run gen:api`)."""
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from main import app  # noqa: E402

target = BACKEND.parent / "frontend" / "openapi.json"
target.write_text(json.dumps(app.openapi(), indent=2), encoding="utf-8")
print(f"wrote {target}")

"""SQLite access. One short-lived connection per request; the path is read at call time so tests can redirect it."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import config

SCHEMA = Path(__file__).with_name("schema.sql")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def session():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_db():
    """FastAPI dependency: a connection that commits on success and rolls back on error."""
    with session() as conn:
        yield conn


def init_db() -> None:
    with session() as conn:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))


def loads(value, default=None):
    if value is None or value == "":
        return default
    return json.loads(value)


def dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def audit(conn, workspace_id: int, user_id: int | None, action: str, entity: str | None = None, detail: str | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_log (workspace_id, user_id, action, entity, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (workspace_id, user_id, action, entity, detail, now()),
    )

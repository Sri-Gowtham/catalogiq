-- Every tenant-owned table carries workspace_id; every query filters on it.

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    industry   TEXT,
    sku_range  TEXT,
    plan       TEXT NOT NULL DEFAULT 'trial',
    is_demo    INTEGER NOT NULL DEFAULT 0,
    onboarded  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'viewer')),
    UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS platforms (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    key          TEXT NOT NULL,
    name         TEXT NOT NULL,
    kind         TEXT NOT NULL,
    region       TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'connected',
    connected_at TEXT,
    rules        TEXT NOT NULL,           -- JSON: limits, mandatory fields, image rules
    UNIQUE (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS batches (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    source_file  TEXT,
    kind         TEXT NOT NULL DEFAULT 'demo',   -- demo | live
    status       TEXT NOT NULL,                  -- queued | running | completed | failed
    job_id       TEXT,                           -- link to a pipeline run in the workbench
    stage        TEXT,                           -- current agent id
    stage_index  INTEGER NOT NULL DEFAULT 0,
    total        INTEGER NOT NULL DEFAULT 0,
    flagged      INTEGER NOT NULL DEFAULT 0,
    ready        INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    finished_at  TEXT,
    error        TEXT
);

CREATE TABLE IF NOT EXISTS products (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    batch_id      INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    sku           TEXT NOT NULL,
    name          TEXT,
    brand         TEXT,
    category      TEXT,
    line          TEXT,
    weight_value  REAL,
    weight_unit   TEXT,
    price         REAL,
    country       TEXT,
    status        TEXT NOT NULL,   -- draft | in_enrichment | flagged | ready | live | upcoming
    audit_score   INTEGER,
    audit_status  TEXT,
    quality_score INTEGER,
    score_detail  TEXT,            -- JSON: six-parameter scorecard
    audit_issues  TEXT,            -- JSON list
    source        TEXT,            -- JSON: raw supplier row
    enriched      TEXT,            -- JSON: cleaned attributes
    launch_date   TEXT,
    origin        TEXT NOT NULL DEFAULT 'demo',   -- demo | live
    created_at    TEXT NOT NULL,
    UNIQUE (workspace_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_products_ws_status ON products (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_products_ws_category ON products (workspace_id, category);

CREATE TABLE IF NOT EXISTS product_images (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL,   -- front | back | lifestyle
    pack_type     TEXT NOT NULL,
    color         TEXT NOT NULL,
    bg_white      INTEGER NOT NULL DEFAULT 1,
    width         INTEGER NOT NULL,
    height        INTEGER NOT NULL,
    quality_score INTEGER NOT NULL,
    notes         TEXT
);

CREATE TABLE IF NOT EXISTS product_content (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    platform_key TEXT NOT NULL,
    title        TEXT NOT NULL,
    title_ar     TEXT,
    bullets      TEXT NOT NULL,     -- JSON list
    description  TEXT NOT NULL,
    attributes   TEXT NOT NULL,     -- JSON object
    keywords     TEXT NOT NULL,     -- JSON list
    status       TEXT NOT NULL DEFAULT 'draft',  -- draft | approved | published
    simulated    INTEGER NOT NULL DEFAULT 1,
    updated_at   TEXT NOT NULL,
    UNIQUE (product_id, platform_key)
);

CREATE TABLE IF NOT EXISTS listings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    platform_key TEXT NOT NULL,
    status       TEXT NOT NULL,     -- queued | live | suppressed
    published_at TEXT,
    price        REAL,
    rank         INTEGER,
    rank_prev    INTEGER,
    primary_keyword TEXT,
    flag         TEXT,              -- ok | watch | flag
    diagnosis    TEXT,
    UNIQUE (product_id, platform_key)
);

CREATE TABLE IF NOT EXISTS performance_daily (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    day         TEXT NOT NULL,
    rank        INTEGER NOT NULL,
    impressions INTEGER NOT NULL,
    clicks      INTEGER NOT NULL,
    orders      INTEGER NOT NULL,
    revenue     REAL NOT NULL,
    returns     INTEGER NOT NULL,
    UNIQUE (listing_id, day)
);
CREATE INDEX IF NOT EXISTS idx_perf_day ON performance_daily (day);

CREATE TABLE IF NOT EXISTS review_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    reason       TEXT NOT NULL,
    severity     TEXT NOT NULL,     -- high | medium | low
    status       TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    created_at   TEXT NOT NULL,
    resolved_at  TEXT,
    resolved_by  INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS rules (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    region       TEXT NOT NULL,     -- ALL | IN | AE | US
    kind         TEXT NOT NULL,     -- restricted_claim | mandatory_claim | trademark | allergen_format
    value        TEXT NOT NULL,
    note         TEXT
);

CREATE TABLE IF NOT EXISTS ab_tests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    variant_a   TEXT NOT NULL,
    variant_b   TEXT NOT NULL,
    status      TEXT NOT NULL,      -- running | completed
    winner      TEXT,
    uplift_pct  REAL,
    started_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    batch_id     INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    agent_id     TEXT NOT NULL,
    mode         TEXT NOT NULL,     -- live | simulated
    status       TEXT NOT NULL,     -- done | running | failed | pending
    started_at   TEXT,
    duration_ms  INTEGER,
    processed    INTEGER,
    skipped      INTEGER,
    tokens       INTEGER,
    note         TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      INTEGER REFERENCES users(id),
    action       TEXT NOT NULL,
    entity       TEXT,
    detail       TEXT,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    text         TEXT NOT NULL,
    level        TEXT NOT NULL DEFAULT 'info',
    read         INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,   -- sha256 of the emailed token; the token itself is never stored
    expires_at   TEXT NOT NULL,
    used         INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    sku_range    TEXT,
    message      TEXT,
    created_at   TEXT NOT NULL
);

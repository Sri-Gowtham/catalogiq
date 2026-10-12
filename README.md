# CatalogIQ

Catalog operations for FMCG and retail brands (UC-49). It audits supplier data, writes content for each marketplace,
blocks listings below a quality score, and tracks rank and sales per listing. It is **not a CRM**: it tracks products,
batches and listings, not customers and deals.

Two parts:

- **The platform** (this repo): a web app where a brand's team logs in and sees its catalog.
- **The agent workbench**: where the agents run. The platform talks to it through one interface
  (`backend/workbench/base.py`), so the SNS Square Agent Workbench can replace the local one without touching the app.

## What is real

Every screen labels its data.

| Label | Meaning |
|---|---|
| **Live** | Real output: Feed Ingestion and the Pre-Enrichment Audit |
| **Simulated** | The agent is not built yet; output is a labelled stand-in |
| **Demo data** | Seeded sample numbers: rankings, clicks, sales, A/B tests |

The demo workspace is a fictional brand, Acme Foods: 240 products, 5 platforms, 30 days of performance. Publishing and
platform connections are simulated; no marketplace API is called.

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

Open http://localhost:5173 and click **View demo**. Vite proxies `/api` to port 8000.
## Tests

- **Backend** (API, roles, sessions, static serving): `cd backend; .\.venv\Scripts\python -m pytest`
- **Browser** (sign-in, roles, workflows, accessibility scan with axe): `cd frontend; npm run test:e2e`. It starts its own API
  on port 8010 and the dev site on 5173 with a fresh database, so stop any dev server on 5173 first. It uses the installed
  Chrome and takes about six minutes.

## Demo logins

Password for all: `Demo@12345`

| Role | Email | Gets |
|---|---|---|
| Admin | demo@acmefoods.example | Everything, including platforms, brand rules and team |
| Manager | manager@acmefoods.example | Review, edit and publish; no team or rule changes |
| Viewer | viewer@acmefoods.example | Read-only dashboards, products, platforms, performance |

In the demo workspace the top bar has a **View as** switch to jump between roles.

## Demo script (about 4 minutes)

1. Landing page, then **View demo**. Overview: counts, sales trend, what needs attention.
2. **Products**, filter by status. Open a live product: **Platform content**, then **Compare all** to see how the
   title, bullets and images differ per platform. **Images** shows checks per marketplace.
3. **Score** (six parameters, gate at 70) and **Performance** (rank per platform, diagnosis, test a fix).
4. **Batches**, **Run sample feed**: watch the agent stages update live. Open a flagged product to see why it was stopped.
5. **Review queue**: approve or reject (keys `J` `K` `A` `R`). **Brand rulebook**: test a sentence.
   **Products**: click a column to sort, save a view, select rows to export or publish. **Batches**: drop a CSV to see a preview first.
6. Switch **View as** to Viewer to show the read-only view.

## Layout

```
backend/
  api/        routers: auth, workspace, catalog, ops (batches, review, platforms), insights
  auth/       scrypt passwords, JWT, role checks, login rate limit
  db/         SQLite schema; every tenant table carries workspace_id
  seed/       deterministic demo data, per-platform content, SVG pack images
  workbench/  connector interface, local adapter, remote stub, run importer
  agents/     Feed Ingestion and Pre-Enrichment Audit (live)
  pipeline/   registry of all 15 agents, runner, stage progress
frontend/src/
  pages/public  landing, login, signup, onboarding
  pages/app     overview, catalog, product, batches, review, platforms, publishing, performance, rules, workbench, reports, settings
  components    app shell, shared kit, badges, shadcn/ui
```

## Connecting the real workbench

Implement `backend/workbench/remote.py` (`health`, `list_agents`, `submit_run`, `get_run`, `get_results`) and start the
backend with `CATALOGIQ_WORKBENCH=remote`. It is a stub until the workbench API is known. To add an agent to the local
pipeline: write its function, wrap it in `pipeline/adapters.py`, and replace its simulated entry in `pipeline/registry.py`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CATALOGIQ_DB` | `output/catalogiq.db` | SQLite file |
| `CATALOGIQ_JWT_SECRET` | generated into `output/.jwt_secret` | Signs sign-in cookies. **Required** in production |
| `CATALOGIQ_WORKBENCH` | `local` | `remote` selects the SNS Square workbench adapter |
| `CATALOGIQ_ENV` | unset | `production` refuses to start without a secret and turns demo logins off |
| `CATALOGIQ_ENABLE_DEMO` | on, except in production | Seeds the Acme demo accounts, whose password is published here |
| `CATALOGIQ_COOKIE_SECURE` | off | Set to `1` when served over https |
| `CATALOGIQ_ALLOWED_ORIGINS` | local dev origins | CORS origins, comma separated |
| `CATALOGIQ_STATIC_DIR` | `frontend/dist` | Built web app; the API serves it when it exists |
| `CATALOGIQ_DEV_RESET_LINKS` | off | Shows the password-reset link on screen. Local demos only |

## Deploying

One container serves the API and the built site on one port:

```
copy .env.example .env      # then set CATALOGIQ_JWT_SECRET
docker compose up --build   # http://localhost:8000
```

Put it behind https (a reverse proxy or your host's TLS) and keep `CATALOGIQ_COOKIE_SECURE=1`. Data lives in the
`catalogiq-data` volume. The container files are written but have not been run on the machine this was built on
(no Docker there); the same production mode was exercised by running the API directly with `CATALOGIQ_ENV=production`.
Without Docker: `cd frontend; npm run build`, then run uvicorn from `backend` with the same environment variables.

## Security notes

- Sessions are an httpOnly, SameSite=Lax cookie; page scripts cannot read it and nothing is kept in browser storage.
  Browser writes must carry an `X-Requested-With: catalogiq` header, which other sites cannot add. API clients can use the
  bearer token returned by the login endpoints instead.
- Passwords are scrypt-hashed. Sign-in, password reset and the contact form are rate limited, and a workspace can start
  at most 20 feeds an hour.
- Password reset answers the same way for every email. Email delivery is not built: the link goes to the server log
  (and on screen only with `CATALOGIQ_DEV_RESET_LINKS=1`).
- Every query is scoped to the caller's workspace, and roles are read from the database on each request, so a role
  change or removal applies at once.
- Billing, email and marketplace publishing are mocks. Demo requests from the contact form are stored in the `leads`
  table; there is no screen to read them yet.

# CatalogIQ design decisions

Read this before changing the UI.

## Direction
An operations product for catalog teams: calm, dense where data lives, trustworthy. Light and dark themes (system by default). Elevation: flat `surface`, `surface-raised` for the one leading panel per page, `surface-floating` for menus. Chart colours are the validated `--chart-1..5` slots. One accent
(CatalogIQ blue, `--primary`). Status colours carry meaning only: `--pass`, `--review`, `--flagged`.

## Sources
| Source | Used for |
|---|---|
| `design-taste-frontend` skill (`.agents/skills/`) | Landing page: hero limits, real screenshots instead of drawn mock-ups, varied section layouts, no em-dashes, short copy. Not applied to dashboard screens. |
| `web-design-guidelines` skill (Vercel) | Accessibility, focus, forms, URL state, motion |
| `docs/design-reference/stripe.DESIGN.md` | Navy ink, cool off-white canvas, hairline borders, blue-tinted shadows, tabular numerals |

One design system per project; do not add another brand file.

## Tokens (`frontend/src/index.css`)
- `surface` utility: white card, hairline border, soft blue-tinted shadow. Radius scale from `--radius`.
- Font: Geist Variable. Numbers use `tabular-nums`.
- Status chips live in `components/badges.tsx`; shared layout pieces (PageHeader, Panel, Kpi, Empty, Field) in `components/kit.tsx`.

## Honesty labels
Every data panel carries a `DataTag`: **Live** (real agent output), **Simulated** (agent not built), **Demo data** (seeded).
Simulated agents use a dashed outline. A demo banner is always visible in the demo workspace.

## Roles
Admin, manager and viewer see different apps, not the same one with hidden buttons: separate overview, role-filtered
navigation, and a restricted-page message. Rules live in `NAV` in `components/AppShell.tsx` and in
`backend/auth/deps.py`; the backend is the source of truth.

## Rules we hold to
- Copy is short: one-line page descriptions, no explanatory paragraphs inside panels. No em-dashes.
- Navigation uses links. Filters and tabs live in the URL.
- Animate `transform` and `opacity` only; honour `prefers-reduced-motion`.
- Async status uses `aria-live="polite"`; loading placeholders announce "Loading…".
- Formats go through `Intl` (`lib/format.ts`), in Indian rupees and `en-IN`.
- API types are written by hand in `api/types.ts`, next to the routes they mirror.

## Open
- The 21st.dev Magic MCP is not installed. It needs the user's own API key; keep keys out of the repo.

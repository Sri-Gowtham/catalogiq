# CatalogIQ design decisions

Short, so a new session can follow it. Read this before changing the UI.

## Direction
An operations dashboard for catalog managers: calm, dense where data lives, trustworthy. Light theme only.
One accent colour (CatalogIQ blue, `--primary`). Status colours carry meaning only: `--pass`, `--review`,
`--flagged`. Simulated agents are always drawn with a dashed outline so they are never mistaken for live ones.

## Sources and how they are used
| Source | Used for | Not used |
|---|---|---|
| `design-taste-frontend` skill (`.agents/skills/`) | Visual direction, anti-slop rules, motion restraint. It targets landing pages, so apply it mostly to the upload page. | Its landing-page layouts on dashboard screens |
| `web-design-guidelines` skill (Vercel) | Audit rules: accessibility, focus, forms, animation, URL state, locale | Title Case for headings, which we skip in favour of sentence case |
| `docs/design-reference/stripe.DESIGN.md` (awesome-design-md, MIT) | Deep navy ink, cool off-white canvas, hairline borders, soft blue-tinted shadows, tabular numerals, 8 px spacing | Gradient mesh, weight-300 display type, indigo primary, the proprietary Sohne font |

Rule from the Taste skill: one design system per project. Do not add another brand file on top of this one.

## Tokens (in `frontend/src/index.css`)
- Ink `oklch(0.27 0.05 250)`, muted text `oklch(0.5 0.045 255)`, canvas `oklch(0.983 0.004 250)`, hairline
  `oklch(0.93 0.01 250)`. Cards are white.
- `surface` utility: white card, hairline border, `0 1px 3px rgb(0 55 112 / 0.08)`.
- Font: Geist Variable. Numbers in tables and KPIs use `tabular-nums`.

## Rules we hold to (Vercel guidelines)
- Navigation is `<a>`/`<Link>`, never a click handler on a row. Filters and search live in the URL.
- Animate `transform` and `opacity` only, honour `prefers-reduced-motion`, never `transition: all`.
- Async status text uses `aria-live="polite"`; loading placeholders announce "Loading…".
- Formats go through `Intl` (`frontend/src/lib/format.ts`). Identifiers carry `translate="no"`.

## Open
- The 21st.dev Magic MCP is not installed. It needs the user's own API key and sends prompts to 21st.dev.
  Add it later at user scope with the key in an environment variable, never in the repo.

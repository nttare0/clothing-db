# ClothFlow web

Front-end for **ClothFlow 1.0** — a single-store clothing retail system (Rwanda, RWF) built to the
`clothflow_system_design_blueprint.pdf` architecture baseline.

## Stack

- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript
- Tailwind CSS v4 + shadcn/ui (base-nova/"nova" preset components, `components/ui/`)
- No UI kit other than shadcn/ui; no demo/placeholder data — API errors surface as real error states.

## Run

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The web app expects the ClothFlow API on `API_INTERNAL_URL` (default `http://localhost:4000`).
`/api/*` is proxied by a Next.js rewrite; the browser only ever talks to the same origin.

## Structure

- `app/` — routes. `(app)/` is the authenticated workspace (cookie-gated on the server);
  public routes: `/signin`, `/forgot-password`, `/reset-password`, `/session-expired`, `/help`.
- `app/(app)/` — dashboard, inventory, categories, products (new/detail/edit), stock-in (list/new),
  sales history, POS (`/pos`), stock movements, notifications, profile.
- `components/app-shell.tsx` — navigation shell (desktop sidebar, mobile drawer, top bar).
- `components/ui/` — shadcn/ui component primitives (base-ui).
- `lib/api.ts` — same-origin fetch wrapper; typed `ApiError`; RWF + date formatting.

Stage locks: screens from later build stages (Returns, Adjustments, Stock Count,
Suppliers, Customers, Expenses, Reports, Staff & Permissions, Audit Logs, Settings)
are intentionally disabled in the navigation with their stage label.

## Conventions

- Prices are RWF, whole francs, `tabular-nums`.
- Stock cannot be edited directly — quantities enter via Stock In and leave via Sales;
  every change writes an immutable `stock_movements` ledger row (API-side).
- The browser holds no secrets; auth is an httpOnly session cookie issued by the API.

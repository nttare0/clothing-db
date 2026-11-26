# ClothFlow API

Server-side business logic for ClothFlow 1.0 (single clothing store, RWF).
Hono + postgres.js against Supabase PostgreSQL; variant-level inventory with an
append-only `stock_movements` ledger; sales and stock-in run in one transaction
with row locking and idempotency keys.

## Endpoints (all under /api)

| Method | Path | Notes |
| --- | --- | --- |
| GET | /health | DB liveness |
| POST | /auth/signin | httpOnly `clothflow_session` cookie (7 days), rate-limited |
| POST | /auth/signout | revokes session |
| GET | /auth/me | current user (401 → `/session-expired` in web) |
| POST | /auth/change-password | revokes other sessions |
| POST | /auth/forgot-password | needs `RESEND_API_KEY`; otherwise honest 503 EMAIL_UNAVAILABLE |
| POST | /auth/reset-password | single-use token; revokes all sessions |
| GET, POST | /categories | create requires `categories.manage` |
| PATCH, POST | /categories/:id, /categories/:id/archive | |
| GET, POST | /products | list: `search, categoryId, status, lowStock, page, pageSize` |
| GET, PATCH | /products/:id | |
| POST | /products/:id/deactivate | |
| GET | /products/:id/movements | recent ledger lines |
| GET, POST | /stock-in | purchase/opening stock; moving-average cost; ledger entries |
| GET | /stock-movements | `productId, reference, search, type, page, pageSize` |
| GET | /pos/search | `q` (min 2 chars), barcode-exact matches first |
| GET | /variants/lookup | `variantId` (stock-in prefill) |
| GET, POST | /sales | POST is idempotent via `Idempotency-Key` header |
| GET | /sales/:id | receipt payload |
| GET | /dashboard | `range=today\|7d\|30d` |
| GET, POST | /notifications | `/unread-count`, `/read-all`, DELETE `/:id` |

## Conventions

- Success: `{ "data": … }`; error: `{ "error": { "code", "message", "requestId" } }`.
- Server is authoritative for prices, totals, stock, and roles (browser values are re-validated).
- Sellable = on_hand − reserved − damaged − quarantined.
- Auth: scrypt password hashes (`s1$N$r$p$salt$hex`); SHA-256-hashed session tokens.
- Rate limiting is in-memory per instance (best effort on serverless, not a global cap).
- Permissions enforced server-side per role (owner, manager, stock_clerk, cashier).

## Env vars (set in deployment, never committed)

- `DATABASE_URL` — Supabase pooler URL (transaction mode, port 6543) or direct URL.
- `RESEND_API_KEY` — optional; enables forgot-password email.
- `RESEND_FROM` — optional sender identity (defaults to Resend's onboarding address).

## Deployment

Deployed as a Vercel project rooted at `apps/api` with zero-config TS functions
(`api/[...slug].ts` catch-all). The web app proxies `/api/*` to this service
via its `API_INTERNAL_URL` env var (same-origin cookies, no CORS).

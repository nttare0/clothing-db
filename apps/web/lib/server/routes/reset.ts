import { randomInt } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db";
import { audit, fail, ok, requireAuth } from "../http";
import { hashToken } from "../crypto";
import { rateLimit } from "../rate-limit";
import { zValidator } from "@hono/zod-validator";
import { hook } from "../validate";

// Owner-only destructive reset. Two steps: request a one-time code
// (shown once on screen), then re-enter the code to execute the wipe.
export const resetRoutes = new Hono();

const PURPOSE = "full_reset";

const ALL_TABLES = [
  "audit_logs",
  "notification_state",
  "notifications",
  "password_reset_tokens",
  "reset_codes",
  "payments",
  "return_items",
  "returns",
  "sale_items",
  "sales",
  "purchase_items",
  "purchases",
  "stock_count_items",
  "stock_counts",
  "stock_movements",
  "inventory_balances",
  "product_variants",
  "products",
  "categories",
  "customers",
  "suppliers",
  "expenses",
  "settings",
  "sessions",
  "users",
];

resetRoutes.post("/request", requireAuth, async (c) => {
  const actor = c.get("user");
  if (actor.role !== "owner") {
    return fail(c, 403, "FORBIDDEN", "Only the owner can reset the store data.");
  }
  if (!rateLimit(`reset-request:${actor.id}`, 5, 10 * 60_000)) {
    return fail(c, 429, "RATE_LIMITED", "Too many codes requested. Wait a few minutes and try again.");
  }
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await sql`INSERT INTO reset_codes (purpose, code_hash, requested_by, expires_at)
            VALUES (${PURPOSE}, ${hashToken(code)}, ${actor.id}, now() + interval '10 minutes')`;
  await audit(actor.id, "db.reset_requested", "system", null, { requestId: c.get("requestId") });
  return ok(c, { code, expiresInMinutes: 10 });
});

resetRoutes.post(
  "/confirm",
  requireAuth,
  zValidator("json", z.object({ code: z.string().trim().regex(/^\d{6}$/, "The code is 6 digits.") }), hook),
  async (c) => {
    const actor = c.get("user");
    if (actor.role !== "owner") {
      return fail(c, 403, "FORBIDDEN", "Only the owner can reset the store data.");
    }
    if (!rateLimit(`reset-confirm:${actor.id}`, 5, 10 * 60_000)) {
      return fail(c, 429, "RATE_LIMITED", "Too many tries. Wait a few minutes and request a new code.");
    }
    const { code } = c.req.valid("json");

    const rows = await sql<{ id: string }[]>`
      SELECT id FROM reset_codes
      WHERE requested_by = ${actor.id}
        AND purpose = ${PURPOSE}
        AND code_hash = ${hashToken(code)}
        AND used_at IS NULL
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const record = rows[0];
    if (!record) {
      return fail(c, 400, "INVALID_CODE", "That code is not right or it expired — request a new one and type it in exactly.");
    }

    await sql.begin(async (tx) => {
      const owners = await tx<{ id: string; name: string | null; email: string; username: string | null; password_hash: string; password_changed_at: string | null; created_at: string }[]>`
        SELECT id, name, email, username, password_hash, password_changed_at, created_at FROM users WHERE id = ${actor.id} LIMIT 1
      `;
      const owner = owners[0]!;

      // Everything goes — every business table, staff account, session and setting.
      await tx.unsafe(`TRUNCATE TABLE ${ALL_TABLES.join(", ")} RESTART IDENTITY CASCADE`);

      // Keep the owner who ran the reset so they can sign back in.
      await tx`
        INSERT INTO users (id, name, email, username, role, status, password_hash, password_changed_at, created_at, updated_at, last_sign_in_at)
        VALUES (${owner.id}, ${owner.name}, ${owner.email}, ${owner.username}, 'owner', 'active', ${owner.password_hash},
                ${owner.password_changed_at}, ${owner.created_at}, now(), now())
      `;
      // One marker row so the audit trail knows what happened.
      await tx`
        INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data, request_id)
        VALUES (${owner.id}, 'db.full_reset', 'system', NULL, '{"note":"Owner wiped all store data via Settings → Reset."}'::jsonb, ${c.get("requestId")})
      `;
    });

    return ok(c, { ok: true });
  },
);

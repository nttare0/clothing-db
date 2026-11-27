import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db";
import { audit, fail, ok, requireAuth, requirePermission } from "../http";
import { zValidator } from "@hono/zod-validator";
import { hook } from "../validate";
import { hashPassword } from "../crypto";

// Owner-only staff management.
export const staffRoutes = new Hono();

const roleEnum = z.enum(["owner", "manager", "stock_clerk", "cashier"]);

staffRoutes.get("/", requireAuth, requirePermission("staff.manage"), async (c) => {
  const rows = await sql<
    { id: string; name: string; email: string; role: string; status: string; last_sign_in_at: string | null; created_at: string; active_until: string | null; password_changed_at: string | null }[]
  >`
    SELECT id, name, email, role, status, last_sign_in_at, created_at, active_until, password_changed_at
    FROM users
    ORDER BY status, role, lower(name)
  `;
  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      status: r.status,
      lastSignInAt: r.last_sign_in_at,
      createdAt: r.created_at,
      activeUntil: r.active_until,
      passwordChangedAt: r.password_changed_at,
    })),
  });
});

staffRoutes.post(
  "/",
  requireAuth,
  requirePermission("staff.manage"),
  zValidator("json", z.object({
    name: z.string().trim().min(1, "Name is required.").max(120),
    email: z.string().trim().email("Enter a valid email.").max(254),
    role: roleEnum,
  }), hook),
  async (c) => {
    const body = c.req.valid("json");
    const actor = c.get("user");
    const email = body.email.trim().toLowerCase();

    const existing = await sql<{ id: string }[]>`SELECT id FROM users WHERE lower(btrim(email)) = ${email} LIMIT 1`;
    if (existing.length > 0) return fail(c, 409, "DUPLICATE_EMAIL", "An account with this email already exists.");

    const tempPassword = `cf-${randomBytes(9).toString("base64url")}`;
    const rows = await sql<{ id: string }[]>`
      INSERT INTO users (name, email, role, password_hash, status, password_changed_at)
      VALUES (${body.name.trim()}, ${email}, ${body.role}, ${hashPassword(tempPassword)}, 'active', now())
      RETURNING id
    `;
    const userId = rows[0]!.id;
    await audit(actor.id, "staff.create", "user", userId, {
      after: { name: body.name.trim(), email, role: body.role },
      requestId: c.get("requestId"),
    });
    // Temp password is shown once to the creating owner and never stored in plain text.
    return ok(c, { id: userId, tempPassword }, 201);
  },
);

async function countActiveOwners(excludeId?: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM users
    WHERE role = 'owner' AND status = 'active' ${excludeId ? sql`AND id <> ${excludeId}` : sql``}
  `;
  return Number(rows[0]?.count ?? 0);
}

staffRoutes.patch(
  "/:id",
  requireAuth,
  requirePermission("staff.manage"),
  zValidator("json", z.object({
    name: z.string().trim().min(1).max(120).optional(),
    role: roleEnum.optional(),
    status: z.enum(["active", "deactivated"]).optional(),
    // ISO datetime string ("" or null to clear the expiry); undefined = unchanged.
    activeUntil: z.union([z.string().min(4).max(40), z.null()]).optional(),
  }), hook),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const actor = c.get("user");

    const existing = await sql<{ id: string; name: string; email: string; role: string; status: string; active_until: string | null }[]>`
      SELECT id, name, email, role, status, active_until FROM users WHERE id = ${id} LIMIT 1
    `;
    const target = existing[0];
    if (!target) return fail(c, 404, "NOT_FOUND", "User not found.");

    const nextRole = body.role ?? target.role;
    const requestedStatus = body.status ?? target.status;
    // Expiry in the past forces deactivation even if the caller left status active.
    const requestedActiveUntil = body.activeUntil === undefined
      ? target.active_until
      : body.activeUntil === "" || body.activeUntil === null
        ? null
        : body.activeUntil;
    const expiryForcesOff = requestedActiveUntil !== null && !Number.isNaN(new Date(requestedActiveUntil).getTime()) && new Date(requestedActiveUntil).getTime() <= Date.now();
    const nextStatus = expiryForcesOff ? "deactivated" : requestedStatus;

    // Never strand the store without an active owner.
    if (target.role === "owner" && (nextRole !== "owner" || nextStatus !== "active")) {
      const others = await countActiveOwners(id);
      if (others === 0) {
        return fail(c, 409, "LAST_OWNER", "This is the last active owner. Promote another owner first.");
      }
    }

    const name = body.name?.trim() ?? target.name;

    // Active period (auto-deactivation). undefined = unchanged; "" / null = no expiry.
    let nextActiveUntil: Date | null | undefined = undefined;
    if (body.activeUntil !== undefined) {
      nextActiveUntil = body.activeUntil === "" || body.activeUntil === null ? null : new Date(body.activeUntil);
      if (nextActiveUntil !== null && Number.isNaN(nextActiveUntil.getTime())) {
        return fail(c, 400, "INVALID_DATE", "That expiry date isn't valid. Pick a date and try again.");
      }
    }
    const effectiveActiveUntil = nextActiveUntil === undefined ? target.active_until : nextActiveUntil?.toISOString() ?? null;

    let finalStatus = nextStatus;
    const expiresNow = effectiveActiveUntil !== null && new Date(effectiveActiveUntil).getTime() <= Date.now();
    if (expiresNow && finalStatus === "active") finalStatus = "deactivated";

    await sql`
      UPDATE users
      SET name = ${name},
          role = ${nextRole},
          status = ${finalStatus},
          active_until = ${effectiveActiveUntil},
          updated_at = now()
      WHERE id = ${id}
    `;
    if (finalStatus === "deactivated") {
      await sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${id} AND revoked_at IS NULL`;
    }
    await audit(actor.id, "staff.update", "user", id, {
      before: { name: target.name, role: target.role, status: target.status, activeUntil: target.active_until },
      after: { name, role: nextRole, status: finalStatus, activeUntil: effectiveActiveUntil },
      requestId: c.get("requestId"),
    });
    return ok(c, { id, activeUntil: effectiveActiveUntil, status: finalStatus });
  },
);


staffRoutes.delete("/:id", requireAuth, requirePermission("staff.manage"), async (c) => {
  const id = c.req.param("id");
  const actor = c.get("user");
  if (actor.id === id) {
    return fail(c, 400, "SELF_DELETE", "You cannot delete your own account.");
  }
  const existing = await sql<{ id: string; name: string; email: string; role: string; status: string }[]>`
    SELECT id, name, email, role, status FROM users WHERE id = ${id} LIMIT 1
  `;
  const target = existing[0];
  if (!target) return fail(c, 404, "NOT_FOUND", "User not found.");

  if (target.role === "owner") {
    const others = await countActiveOwners(id);
    if (others === 0) {
      return fail(c, 409, "LAST_OWNER", "This is the last active owner. Promote another owner first.");
    }
  }

  // Hard delete only when nothing references the account — otherwise history would dangle.
  const dependents = await sql<{ refs: number }[]>`
    SELECT (
      (SELECT COUNT(*) FROM sales WHERE cashier_id = ${id}) +
      (SELECT COUNT(*) FROM stock_movements WHERE actor_id = ${id}) +
      (SELECT COUNT(*) FROM purchases WHERE received_by = ${id}) +
      (SELECT COUNT(*) FROM products WHERE created_by = ${id}) +
      (SELECT COUNT(*) FROM expenses WHERE entered_by = ${id}) +
      (SELECT COUNT(*) FROM returns WHERE processed_by = ${id}) +
      (SELECT COUNT(*) FROM stock_counts WHERE created_by = ${id}) +
      (SELECT COUNT(*) FROM audit_logs WHERE actor_id = ${id}) +
      (SELECT COUNT(*) FROM settings WHERE updated_by = ${id})
    )::int AS refs
  `;
  const refs = dependents[0]?.refs ?? 0;
  if (refs > 0) {
    return fail(c, 409, "HAS_ACTIVITY", `This account has ${refs} record${refs === 1 ? "" : "s"} in the store (sales, stock, expenses or audit). Deactivate it instead of deleting it.`);
  }

  await sql`DELETE FROM users WHERE id = ${id}`; // sessions / reset tokens / notification state cascade
  await audit(actor.id, "staff.delete", "user", id, {
    before: { name: target.name, email: target.email, role: target.role, status: target.status },
    requestId: c.get("requestId"),
  });
  return ok(c, { id });
});

staffRoutes.post("/:id/reset-password", requireAuth, requirePermission("staff.manage"), async (c) => {
  const id = c.req.param("id");
  const actor = c.get("user");
  const existing = await sql<{ id: string; email: string }[]>`SELECT id, email FROM users WHERE id = ${id} LIMIT 1`;
  if (existing.length === 0) return fail(c, 404, "NOT_FOUND", "User not found.");

  const tempPassword = `cf-${randomBytes(9).toString("base64url")}`;
  await sql`UPDATE users SET password_hash = ${hashPassword(tempPassword)}, password_changed_at = now(), updated_at = now() WHERE id = ${id}`;
  await sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${id} AND revoked_at IS NULL`;
  await audit(actor.id, "staff.reset_password", "user", id, { requestId: c.get("requestId") });
  return ok(c, { tempPassword });
});

// ---------- Audit log (owner-only, read-only) ----------
export const auditRoutes = new Hono();

auditRoutes.get("/", requireAuth, requirePermission("audit.view"), async (c) => {
  const params = new URL(c.req.url).searchParams;
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const actor = params.get("actor") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "30") || 30));
  const offset = (page - 1) * pageSize;
  const like = `%${search}%`;
  const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor);

  const where = sql`
    WHERE (${actor === "" ? null : actor}::uuid IS NULL OR a.actor_id = ${isUuid ? actor : null}::uuid)
      AND (${dateOk(from) ? from : null}::date IS NULL OR a.created_at >= ${dateOk(from) ? from : null}::date)
      AND (${dateOk(to) ? to : null}::date IS NULL OR a.created_at < (${dateOk(to) ? to : null}::date + 1))
      AND (${search === "" ? null : like}::text IS NULL
           OR lower(a.action) LIKE ${like} OR lower(a.entity_type) LIKE ${like} OR lower(coalesce(u.name, '')) LIKE ${like})
  `;

  const rows = await sql<
    { id: string; created_at: string; action: string; entity_type: string; entity_id: string | null; actor_name: string | null; request_id: string | null }[]
  >`
    SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_id, u.name AS actor_name, a.request_id
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const countRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
    ${where}
  `;

  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      actorName: r.actor_name,
      requestId: r.request_id,
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  });
});

auditRoutes.get("/:id", requireAuth, requirePermission("audit.view"), async (c) => {
  const id = c.req.param("id");
  const rows = await sql`
    SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.before_data, a.after_data, a.request_id, u.name AS actor_name
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.id = ${id} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return fail(c, 404, "NOT_FOUND", "Audit event not found.");
  return ok(c, row);
});

// ---------- Settings ----------
export const settingsRoutes = new Hono();
const PUBLIC_KEYS = ["store_name", "store_address", "store_phone", "receipt_footer", "currency", "low_stock_default", "allowed_payment_methods"] as const;
type PublicKey = (typeof PUBLIC_KEYS)[number];

settingsRoutes.get("/", requireAuth, async (c) => {
  const rows = await sql<{ key: string; value: unknown }[]>`SELECT key, value FROM settings WHERE key = ANY(${[...PUBLIC_KEYS]})`;
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  // Fill defaults so a fresh deployment still prints a sensible receipt.
  if (out.store_name === undefined) out.store_name = "ClothFlow Store";
  if (out.currency === undefined) out.currency = "RWF";
  if (out.low_stock_default === undefined) out.low_stock_default = 5;
  if (out.receipt_footer === undefined) out.receipt_footer = "Thank you for shopping with us";
  if (out.allowed_payment_methods === undefined) out.allowed_payment_methods = ["cash", "mobile_money", "card", "bank_transfer"];
  return ok(c, out);
});

settingsRoutes.patch(
  "/",
  requireAuth,
  requirePermission("settings.manage"),
  zValidator("json", z.object({
    store_name: z.string().trim().min(1).max(120).optional(),
    store_address: z.string().trim().max(300).optional(),
    store_phone: z.string().trim().max(40).optional(),
    receipt_footer: z.string().trim().max(200).optional(),
    low_stock_default: z.number().int().min(0).max(100_000).optional(),
    allowed_payment_methods: z.array(z.enum(["cash", "mobile_money", "card", "bank_transfer"])).min(1, "Keep at least one payment method.").max(4).optional(),
  }), hook),
  async (c) => {
    const body = c.req.valid("json") as Partial<Record<PublicKey, unknown>>;
    const user = c.get("user");
    const entries = Object.entries(body).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return ok(c, { ok: true });

    await sql.begin(async (tx) => {
      for (const [key, value] of entries) {
        await tx`
          INSERT INTO settings (key, value, updated_by, updated_at)
          VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${user.id}, now())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
        `;
      }
    });
    await audit(user.id, "settings.update", "settings", null, {
      after: body,
      requestId: c.get("requestId"),
    });
    return ok(c, { ok: true });
  },
);

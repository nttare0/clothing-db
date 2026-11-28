import { randomUUID } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { sql } from "./db";
import { hashToken } from "./crypto";
import { roleCan, type Permission } from "./permissions";

export const SESSION_COOKIE = "clothflow_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // absolute expiry, 7 days
export const SESSION_IDLE_SECONDS = 60 * 15; // end the session after 15 minutes of no use

export type AuthedUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  username: string | null;
  /** Set when this session is an impersonation (owner switched into the account). */
  impersonatedBy: { id: string; name: string | null } | null;
};

declare module "hono" {
  interface ContextVariableMap {
    user: AuthedUser;
    requestId: string;
  }
}

export function newRequestId(): string {
  return randomUUID();
}

export function ok<T>(c: Context, data: T, status = 200) {
  return c.json({ data }, status as never);
}

export function fail(c: Context, status: number, code: string, message: string) {
  const requestId = c.get("requestId") ?? randomUUID();
  return c.json({ error: { code, message, requestId } }, status as never);
}

export async function findSessionUser(token: string | undefined): Promise<AuthedUser | null> {
  if (!token) return null;
  const token_hash = hashToken(token);
  const rows = await sql<(Omit<AuthedUser, "impersonatedBy"> & { active_until: string | null; session_id: string; last_seen_at: string; impersonated_by: string | null; impersonator_name: string | null })[]>`
    SELECT u.id, u.name, u.email, u.role, u.username, u.active_until,
           s.id AS session_id, s.last_seen_at, s.impersonated_by, iu.name AS impersonator_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users iu ON iu.id = s.impersonated_by
    WHERE s.token_hash = ${token_hash}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.status = 'active'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  // 15 minutes of no use: end the session (user can simply sign back in).
  const idleFor = Date.now() - new Date(row.last_seen_at).getTime();
  if (idleFor > SESSION_IDLE_SECONDS * 1000) {
    await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${row.session_id}`;
    return null;
  }
  // Active period expired mid-session: deactivate lazily and drop the session.
  if (row.active_until && new Date(row.active_until).getTime() <= Date.now()) {
    await sql`UPDATE users SET status = 'deactivated', updated_at = now() WHERE id = ${row.id} AND status = 'active'`;
    await sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${row.id} AND revoked_at IS NULL`;
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    username: row.username,
    impersonatedBy: row.impersonated_by ? { id: row.impersonated_by, name: row.impersonator_name } : null,
  };
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = await findSessionUser(token);
  if (!user) return fail(c, 401, "SESSION_EXPIRED", "Your session ended after 15 minutes of inactivity. Sign in again.");
  c.set("user", user);
  // Bump last_seen at most once a minute so the idle clock and the
  // owner "who is online" view stay accurate without a write per request.
  if (token) {
    await sql`UPDATE sessions SET last_seen_at = now() WHERE token_hash = ${hashToken(token)} AND last_seen_at < now() - interval '1 minute'`;
  }
  await next();
};

export function requirePermission(permission: Permission): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user");
    if (!user || !roleCan(user.role, permission)) {
      return fail(c, 403, "FORBIDDEN", "Your account does not have permission for this action.");
    }
    await next();
  };
}

export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  opts: { before?: unknown; after?: unknown; requestId?: string } = {},
): Promise<void> {
  try {
    await sql`
      INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, request_id)
      VALUES (${actorId}, ${action}, ${entityType}, ${entityId},
              ${opts.before ? JSON.stringify(opts.before) : null}::jsonb,
              ${opts.after ? JSON.stringify(opts.after) : null}::jsonb,
              ${opts.requestId ?? null})
    `;
  } catch (err) {
    // Audit must never crash the request, but it must be visible in logs.
    console.error("audit_log_failed", action, err);
  }
}

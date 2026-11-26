import { randomUUID } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, deleteCookie } from "hono/cookie";
import { sql } from "./db";
import { hashToken } from "./crypto";
import { roleCan, type Permission } from "./permissions";

export const SESSION_COOKIE = "clothflow_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type AuthedUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
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
  const rows = await sql<AuthedUser[]>`
    SELECT u.id, u.name, u.email, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${token_hash}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.status = 'active'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = await findSessionUser(token);
  if (!user) return fail(c, 401, "SESSION_EXPIRED", "Your session has expired. Sign in again.");
  c.set("user", user);
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

import { Hono } from "hono";
import { z } from "zod";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sql } from "../db";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  audit,
  fail,
  ok,
  requireAuth,
} from "../http";
import { generateSessionToken, hashToken } from "../crypto";
import { zValidator } from "@hono/zod-validator";
import { hook, uuidLike } from "../validate";

// Owner-only account switching ("sign in as…"). The session remembers who the
// real owner is, so "switch back" always lands on the original account.
export const impersonationRoutes = new Hono();

impersonationRoutes.post(
  "/start",
  requireAuth,
  zValidator("json", z.object({ userId: uuidLike }), hook),
  async (c) => {
    const actor = c.get("user");
    if (actor.role !== "owner") {
      return fail(c, 403, "FORBIDDEN", "Only the owner can sign in as another account.");
    }
    const { userId } = c.req.valid("json");
    const rows = await sql<{ id: string; name: string | null; status: string }[]>`
      SELECT id, name, status FROM users WHERE id = ${userId} LIMIT 1
    `;
    const target = rows[0];
    if (!target) return fail(c, 404, "NOT_FOUND", "Account not found.");
    if (target.status !== "active") {
      return fail(c, 409, "NOT_ACTIVE", "That account is deactivated — reactivate it before switching into it.");
    }
    if (target.id === actor.id) return fail(c, 400, "SELF", "You are already in this account.");

    // Nested switches keep the original owner as the root to return to.
    const rootId = actor.impersonatedBy?.id ?? actor.id;
    const token = generateSessionToken();
    await sql`
      INSERT INTO sessions (user_id, token_hash, expires_at, impersonated_by)
      VALUES (${target.id}, ${hashToken(token)}, now() + make_interval(secs => ${SESSION_TTL_SECONDS}), ${rootId})
    `;
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: true,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    await audit(actor.id, "staff.impersonate_start", "user", target.id, {
      after: { targetId: target.id, targetName: target.name, rootId },
      requestId: c.get("requestId"),
    });
    return ok(c, { ok: true, name: target.name });
  },
);

impersonationRoutes.post("/stop", requireAuth, async (c) => {
  const actor = c.get("user");
  if (!actor.impersonatedBy) {
    return fail(c, 400, "NOT_IMPERSONATING", "You are not signed in as another account.");
  }
  const rootId = actor.impersonatedBy.id;
  const token = getCookie(c, SESSION_COOKIE);
  const rootRows = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM users WHERE id = ${rootId} LIMIT 1
  `;
  const root = rootRows[0];
  if (!root || root.status !== "active") {
    // Cannot go back to an account that is gone or deactivated — sign out fully.
    if (token) await sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)}`;
    deleteCookie(c, SESSION_COOKIE, { httpOnly: true, sameSite: "Lax", secure: true, path: "/" });
    return fail(c, 403, "ROOT_UNAVAILABLE", "The owner account is not available anymore. Sign in again.");
  }
  const newToken = generateSessionToken();
  await sql.begin(async (tx) => {
    if (token) await tx`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)}`;
    await tx`
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES (${rootId}, ${hashToken(newToken)}, now() + make_interval(secs => ${SESSION_TTL_SECONDS}))
    `;
  });
  setCookie(c, SESSION_COOKIE, newToken, {
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  await audit(rootId, "staff.impersonate_stop", "user", actor.id, {
    before: { wasActingAs: actor.id },
    requestId: c.get("requestId"),
  });
  return ok(c, { ok: true });
});

import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { z } from "zod";
import { sql } from "../db";
import {
  generateResetToken,
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../crypto";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  audit,
  fail,
  ok,
  requireAuth,
} from "../http";
import { rateLimit, signinLockSeconds, recordSigninFailure, clearSigninFailures } from "../rate-limit"; // rateLimit still guards forgot-password
import { zValidator } from "@hono/zod-validator";
import { hook } from "../validate";

export const authRoutes = new Hono();

authRoutes.post(
  "/signin",
  zValidator("json",
    z.object({
      identifier: z.string().trim().min(1).max(254),
      password: z.string().min(1).max(200),
    }),
  ),
  async (c) => {
    const { identifier, password } = c.req.valid("json");
    const key = identifier.toLowerCase();

    // Account lockout: 5 wrong passwords locks this account for 60 seconds.
    const lockSeconds = signinLockSeconds(key);
    if (lockSeconds !== null) {
      return c.json(
        { error: { code: "LOCKED", message: `Too many wrong passwords. Try again in ${lockSeconds} seconds.`, requestId: c.get("requestId"), retryAfter: lockSeconds } },
        429,
      );
    }

    const rows = await sql<
      { id: string; name: string | null; email: string; role: string; password_hash: string; status: string; active_until: string | null }[]
    >`
      SELECT id, name, email, role, password_hash, status, active_until
      FROM users
      WHERE lower(btrim(email)) = ${key} OR lower(btrim(username)) = ${key}
      LIMIT 1
    `;
    let user = rows[0];
    // Lazily deactivate accounts whose active period has ended.
    if (user && user.status === "active" && user.active_until && new Date(user.active_until).getTime() <= Date.now()) {
      await sql`UPDATE users SET status = 'deactivated', updated_at = now() WHERE id = ${user.id}`;
      await sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${user.id} AND revoked_at IS NULL`;
      user = { ...user, status: "deactivated" };
    }

    // Same response whether the account exists, is deactivated or the password is wrong.
    if (!user || user.status !== "active" || !verifyPassword(password, user.password_hash)) {
      const failure = recordSigninFailure(key);
      if (failure.blocked) {
        return c.json(
          { error: { code: "LOCKED", message: `Too many wrong passwords. Try again in ${failure.retryAfter} seconds.`, requestId: c.get("requestId"), retryAfter: failure.retryAfter } },
          429,
        );
      }
      return c.json(
        { error: { code: "INVALID_CREDENTIALS", message: `Invalid email or password. ${failure.remaining} attempt${failure.remaining === 1 ? "" : "s"} left before a 1-minute lock.`, requestId: c.get("requestId"), attemptsLeft: failure.remaining } },
        400,
      );
    }
    clearSigninFailures(key);

    const token = generateSessionToken();
    await sql`
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${hashToken(token)}, now() + make_interval(secs => ${SESSION_TTL_SECONDS}))
    `;
    await sql`UPDATE users SET last_sign_in_at = now() WHERE id = ${user.id}`;

    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: true,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });

    return ok(c, { name: user.name, email: user.email, role: user.role });
  },
);

authRoutes.post("/signout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)}`;
  }
  deleteCookie(c, SESSION_COOKIE, { httpOnly: true, sameSite: "Lax", secure: true, path: "/" });
  return ok(c, { ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await sql<{ id: string; name: string | null; email: string; role: string; created_at: string }[]>`
    SELECT id, name, email, role, created_at FROM users WHERE id = ${user.id} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return fail(c, 401, "SESSION_EXPIRED", "Your session has expired. Sign in again.");
  return ok(c, { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at });
});

authRoutes.post(
  "/change-password",
  requireAuth,
  zValidator("json",
    z.object({
      currentPassword: z.string().min(1).max(200),
      newPassword: z.string().min(10, "New password must be at least 10 characters.").max(200),
    }),
    hook,
  ),
  async (c) => {
    const user = c.get("user");
    const { currentPassword, newPassword } = c.req.valid("json");
    const rows = await sql<{ password_hash: string }[]>`
      SELECT password_hash FROM users WHERE id = ${user.id} LIMIT 1
    `;
    const stored = rows[0]?.password_hash;
    if (!stored || !verifyPassword(currentPassword, stored)) {
      return fail(c, 400, "INVALID_CURRENT_PASSWORD", "Your current password is not correct.");
    }
    await sql`UPDATE users SET password_hash = ${hashPassword(newPassword)}, password_changed_at = now(), updated_at = now() WHERE id = ${user.id}`;
    // Keep the current session, revoke all others.
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      await sql`
        UPDATE sessions SET revoked_at = now()
        WHERE user_id = ${user.id} AND token_hash <> ${hashToken(token)} AND revoked_at IS NULL
      `;
    }
    await audit(user.id, "auth.change_password", "user", user.id, { requestId: c.get("requestId") });
    return ok(c, { ok: true });
  },
);

authRoutes.post(
  "/forgot-password",
  zValidator("json", z.object({ email: z.string().trim().email().max(254) }), hook),
  async (c) => {
    const { email } = c.req.valid("json");
    const key = email.toLowerCase();
    if (!rateLimit(`forgot:${key}`, 5, 15 * 60_000)) {
      return fail(c, 429, "RATE_LIMITED", "Too many attempts. Try again later.");
    }

    const rows = await sql<{ id: string; name: string | null; email: string }[]>`
      SELECT id, name, email FROM users WHERE lower(btrim(email)) = ${key} AND status = 'active' LIMIT 1
    `;
    const user = rows[0];

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      // Honest behaviour: without an email transport we cannot deliver a reset link.
      return fail(
        c,
        503,
        "EMAIL_UNAVAILABLE",
        "Email delivery is not configured for this deployment. Ask the store owner to reset your password.",
      );
    }

    if (user) {
      const token = generateResetToken();
      await sql`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES (${user.id}, ${hashToken(token)}, now() + interval '30 minutes')
      `;
      const base = process.env.APP_BASE_URL ?? "https://clothflow-web.vercel.app";
      const url = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? "ClothFlow <no-reply@clothflow.store>",
          to: [user.email],
          subject: "Reset your ClothFlow password",
          text: `A password reset was requested for your ClothFlow account.\n\nOpen this link within 30 minutes:\n${url}\n\nIf you did not request this, ignore this email.`,
        }),
      });
      if (!res.ok) {
        console.error("resend_failed", res.status, await res.text());
        return fail(c, 503, "EMAIL_UNAVAILABLE", "Could not send the reset email. Try again later.");
      }
    }

    // Same response whether or not the account exists.
    return ok(c, { ok: true });
  },
);

authRoutes.post(
  "/reset-password",
  zValidator("json",
    z.object({
      token: z.string().min(10).max(200),
      password: z.string().min(10, "New password must be at least 10 characters.").max(200),
    }),
    hook,
  ),
  async (c) => {
    const { token, password } = c.req.valid("json");
    const rows = await sql<{ id: string; user_id: string; expires_at: Date; used_at: Date | null }[]>`
      SELECT id, user_id, expires_at, used_at FROM password_reset_tokens
      WHERE token_hash = ${hashToken(token)} LIMIT 1
    `;
    const record = rows[0];
    if (!record) return fail(c, 400, "TOKEN_INVALID", "This reset link is not valid.");
    if (record.used_at) return fail(c, 400, "TOKEN_INVALID", "This reset link has already been used.");
    if (new Date(record.expires_at).getTime() < Date.now()) {
      return fail(c, 400, "TOKEN_EXPIRED", "This reset link has expired. Request a new one.");
    }

    await sql.begin(async (tx) => {
      await tx`UPDATE users SET password_hash = ${hashPassword(password)}, password_changed_at = now(), updated_at = now() WHERE id = ${record.user_id}`;
      await tx`UPDATE password_reset_tokens SET used_at = now() WHERE id = ${record.id}`;
      await tx`UPDATE sessions SET revoked_at = now() WHERE user_id = ${record.user_id} AND revoked_at IS NULL`;
    });
    await audit(record.user_id, "auth.reset_password", "user", record.user_id, {
      requestId: c.get("requestId"),
    });
    return ok(c, { ok: true });
  },
);

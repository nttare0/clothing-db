import type { Context } from "hono";
import { z } from "zod";

/**
 * Matches any 8-4-4-4-12 hex string with hyphens (what Postgres accepts as a uuid).
 * Deliberately laxer than RFC-9562 variant rules — seeded ids and legacy rows
 * (e.g. de000000-0000-4000-7000-…) are valid Postgres uuids and must not be rejected.
 */
export const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Pick a valid option and try again.");

/** Shared on-failure hook for @hono/zod-validator that keeps ClothFlow's error envelope. */
const FRIENDLY_PATHS: Record<string, string> = {
  allowedPaymentMethods: "Payment methods",
  "allowed_payment_methods": "Payment methods",
  categoryId: "Category",
  variantId: "Item",
  customerPhone: "Customer phone",
};
const FRIENDLY_MESSAGES: [RegExp, string][] = [
  [/expected array, received string/i, "tick or untick the methods you accept — it should be a list, not text."],
  [/expected number, received string/i, "enter a number."],
  [/invalid input/i, "check what you entered and try again."],
];

export const validationHook = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, c: Context): Response | void => {
  if (result.success) return;
  const first = result.error?.issues[0];
  const rawPath = first?.path.filter((p) => p !== undefined && p !== null).join(".") ?? "";
  const humanize = (key: string) =>
    key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._-]+/g, " ").trim().toLowerCase();
  const key = rawPath.split(".").pop() ?? rawPath;
  const friendlyPath = FRIENDLY_PATHS[key] ?? (key ? `${humanize(key).charAt(0).toUpperCase()}${humanize(key).slice(1)}` : "");
  let message = first?.message ?? "Please check the form and try again.";
  for (const [pattern, friendly] of FRIENDLY_MESSAGES) {
    if (pattern.test(message)) {
      message = friendly;
      break;
    }
  }
  const requestId = (c.get("requestId") as string | undefined) ?? "unknown";
  return c.json({ error: { code: "VALIDATION", message: friendlyPath ? `${friendlyPath}: ${message}` : message, requestId } }, 400);
};
// The hook is structurally compatible with @hono/zod-validator's Hook type.
export const hook = validationHook as never;

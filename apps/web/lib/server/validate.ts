import type { Context } from "hono";

/** Shared on-failure hook for @hono/zod-validator that keeps ClothFlow's error envelope. */
export const validationHook = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, c: Context): Response | void => {
  if (result.success) return;
  const first = result.error?.issues[0];
  const humanize = (key: string) =>
    key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._-]+/g, " ").trim().toLowerCase();
  const path = humanize(first?.path.filter((p) => p !== undefined && p !== null).join(".") ?? "");
  const message = first
    ? `${path ? `${path.charAt(0).toUpperCase()}${path.slice(1)}: ` : ""}${first.message}`
    : "Please check the form and try again.";
  const requestId = (c.get("requestId") as string | undefined) ?? "unknown";
  return c.json({ error: { code: "VALIDATION", message, requestId } }, 400);
};
// The hook is structurally compatible with @hono/zod-validator's Hook type.
export const hook = validationHook as never;

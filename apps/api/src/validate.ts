import type { Context } from "hono";

/** Shared on-failure hook for @hono/zod-validator that keeps ClothFlow's error envelope. */
export const validationHook = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, c: Context): Response | void => {
  if (result.success) return;
  const first = result.error?.issues[0];
  const path = first?.path.filter((p) => p !== undefined && p !== null).join(".") ?? "";
  const message = first ? `${path ? `${path}: ` : ""}${first.message}` : "Invalid input.";
  const requestId = (c.get("requestId") as string | undefined) ?? "unknown";
  return c.json({ error: { code: "VALIDATION", message, requestId } }, 400);
};
// The hook is structurally compatible with @hono/zod-validator's Hook type.
export const hook = validationHook as never;

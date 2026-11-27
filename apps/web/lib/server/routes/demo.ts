import { Hono } from "hono";
import { ok, requireAuth, requirePermission } from "../http";
import { getDemoState, removeDemoData } from "../demo";

export const demoRoutes = new Hono();

demoRoutes.get("/", requireAuth, async (c) => {
  return ok(c, { active: (await getDemoState()) === "active" });
});

demoRoutes.post("/remove", requireAuth, requirePermission("settings.manage"), async (c) => {
  const user = c.get("user");
  const result = await removeDemoData(user.id, c.get("requestId"));
  return ok(c, result);
});

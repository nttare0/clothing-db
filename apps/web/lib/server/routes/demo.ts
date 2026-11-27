import { Hono } from "hono";
import { ok, requireAuth } from "../http";
import { ensureDemoSeed, getDemoState, removeDemoData } from "../demo";

export const demoRoutes = new Hono();

// Status + safety-net seed. The primary seed happens at sign-in on an empty store;
// calling it here too keeps the demo promise true for sessions issued before the
// demo feature was deployed.
demoRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  try {
    await ensureDemoSeed(user.id);
  } catch (err) {
    console.error("demo_seed_failed", err);
  }
  return ok(c, { active: (await getDemoState()) === "active" });
});

demoRoutes.post("/remove", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await removeDemoData(user.id, c.get("requestId"));
  return ok(c, result);
});

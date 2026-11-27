import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRoutes } from "./routes/auth";
import { categoryRoutes, productRoutes } from "./routes/catalogue";
import { movementRoutes, posRoutes, variantsRoutes } from "./routes/pos";
import { salesRoutes } from "./routes/sales";
import { stockRoutes } from "./routes/stock";
import { dashboardRoutes } from "./routes/dashboard";
import { notificationRoutes } from "./routes/notifications";
import { demoRoutes } from "./routes/demo";
import { returnsRoutes } from "./routes/returns";
import { adjustmentRoutes, countRoutes } from "./routes/adjustments";
import { customerRoutes, supplierRoutes } from "./routes/people";
import { expenseRoutes } from "./routes/expenses";
import { reportRoutes } from "./routes/reports";
import { auditRoutes, settingsRoutes, staffRoutes } from "./routes/admin";

export function createApp() {
  const app = new Hono().basePath("/api");

  app.use("*", async (c, next) => {
    c.set("requestId", randomUUID());
    c.header("x-request-id", c.get("requestId"));
    await next();
  });

  app.onError((err, c) => {
    const requestId = c.get("requestId") ?? randomUUID();
    if (err instanceof HTTPException) {
      return c.json({ error: { code: "HTTP_ERROR", message: err.message, requestId } }, err.status);
    }
    // Full detail stays in server logs; the employee sees a safe, referenceable message.
    console.error("unhandled_error", requestId, err);
    return c.json(
      { error: { code: "INTERNAL", message: `Sorry — something went wrong on our side. Please try again. If it keeps happening, show this code to the store administrator: ${requestId}`, requestId } },
      500,
    );
  });

  app.notFound((c) =>
    c.json({ error: { code: "NOT_FOUND", message: "We couldn't find what you asked for.", requestId: c.get("requestId") } }, 404),
  );

  app.get("/health", async (c) => {
    try {
      const { sql } = await import("./db");
      await sql`SELECT 1`;
      return c.json({ data: { ok: true, db: "up", version: "1.0.0" } });
    } catch (err) {
      console.error("health_db_failed", err);
      return c.json({ error: { code: "DB_DOWN", message: "Database unavailable.", requestId: c.get("requestId") } }, 503);
    }
  });

  app.route("/auth", authRoutes);
  app.route("/categories", categoryRoutes);
  app.route("/products", productRoutes);
  app.route("/stock-in", stockRoutes);
  app.route("/stock-movements", movementRoutes);
  app.route("/pos", posRoutes);
  app.route("/variants", variantsRoutes);
  app.route("/sales", salesRoutes);
  app.route("/dashboard", dashboardRoutes);
  app.route("/notifications", notificationRoutes);
  app.route("/demo", demoRoutes);
  app.route("/returns", returnsRoutes);
  app.route("/adjustments", adjustmentRoutes);
  app.route("/stock-counts", countRoutes);
  app.route("/suppliers", supplierRoutes);
  app.route("/customers", customerRoutes);
  app.route("/expenses", expenseRoutes);
  app.route("/reports", reportRoutes);
  app.route("/staff", staffRoutes);
  app.route("/audit-logs", auditRoutes);
  app.route("/settings", settingsRoutes);

  return app;
}

export default createApp;

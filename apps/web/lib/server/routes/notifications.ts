import { Hono } from "hono";
import { sql } from "../db";
import { fail, ok, requireAuth } from "../http";

export const notificationRoutes = new Hono();

notificationRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await sql<
    {
      id: string;
      created_at: string;
      severity: string;
      type: string;
      title: string;
      body: string | null;
      action_href: string | null;
      action_label: string | null;
      read_at: string | null;
    }[]
  >`
    SELECT n.id, n.created_at, n.severity, n.type, n.title, n.body, n.action_href, n.action_label, ns.read_at
    FROM notifications n
    LEFT JOIN notification_state ns
      ON ns.notification_id = n.id AND ns.user_id = ${user.id}
    WHERE ns.dismissed_at IS NULL
    ORDER BY n.created_at DESC
    LIMIT 50
  `;
  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      severity: r.severity,
      title: r.title,
      body: r.body,
      actionLabel: r.action_label,
      actionHref: r.action_href,
      readAt: r.read_at,
    })),
  });
});

notificationRoutes.get("/unread-count", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM notifications n
    LEFT JOIN notification_state ns
      ON ns.notification_id = n.id AND ns.user_id = ${user.id}
    WHERE ns.dismissed_at IS NULL AND ns.read_at IS NULL
  `;
  return ok(c, { unread: Number(rows[0]?.count ?? 0) });
});

notificationRoutes.post("/read-all", requireAuth, async (c) => {
  const user = c.get("user");
  await sql`
    INSERT INTO notification_state (user_id, notification_id, read_at)
    SELECT ${user.id}, n.id, now()
    FROM notifications n
    WHERE NOT EXISTS (
      SELECT 1 FROM notification_state ns WHERE ns.notification_id = n.id AND ns.user_id = ${user.id} AND ns.read_at IS NOT NULL
    )
    ON CONFLICT (user_id, notification_id) DO UPDATE SET read_at = COALESCE(notification_state.read_at, now())
  `;
  return ok(c, { ok: true });
});

notificationRoutes.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(c, 400, "VALIDATION", "Invalid notification id.");
  await sql`
    INSERT INTO notification_state (user_id, notification_id, dismissed_at)
    VALUES (${user.id}, ${id}, now())
    ON CONFLICT (user_id, notification_id) DO UPDATE SET dismissed_at = now()
  `;
  return ok(c, { ok: true });
});

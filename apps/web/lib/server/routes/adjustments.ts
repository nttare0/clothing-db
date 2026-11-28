import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db";
import { audit, fail, ok, requireAuth, requirePermission } from "../http";
import { zValidator } from "@hono/zod-validator";
import { hook, uuidLike } from "../validate";

// ---------- Adjustments: losses, damage, found stock, corrections ----------
export const adjustmentRoutes = new Hono();

const adjustmentBody = z.object({
  variantId: uuidLike,
  kind: z.enum(["loss", "damage", "found", "correction"]),
  quantity: z.number().int().positive("Quantity must be a positive integer.").max(1_000_000),
  // correction only: direction of the count difference
  direction: z.enum(["increase", "decrease"]).optional(),
  reason: z.string().trim().min(1, "A reason is required.").max(120),
  note: z.string().trim().max(500).nullable().optional(),
});

adjustmentRoutes.post(
  "/",
  requireAuth,
  requirePermission("adjustments.manage"),
  zValidator("json", adjustmentBody, hook),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");

    try {
      const result = await sql.begin(async (tx) => {
        const rows = await tx<
          {
            variant_id: string;
            quantity_on_hand: number;
            quantity_reserved: number;
            quantity_damaged: number;
            quantity_quarantined: number;
            sku: string;
            product_name: string;
            status: string;
          }[]
        >`
          SELECT b.variant_id, b.quantity_on_hand, b.quantity_reserved, b.quantity_damaged, b.quantity_quarantined,
                 v.sku, p.name AS product_name, v.status
          FROM inventory_balances b
          JOIN product_variants v ON v.id = b.variant_id
          JOIN products p ON p.id = v.product_id
          WHERE b.variant_id = ${body.variantId}
          FOR UPDATE OF b
        `;
        const balance = rows[0];
        if (!balance) throw new AdjustmentError(404, "VARIANT_NOT_FOUND", "Variant not found.");
        if (balance.status !== "active") {
          throw new AdjustmentError(409, "VARIANT_DEACTIVATED", `${balance.product_name} (${balance.sku}) is deactivated.`);
        }

        const onHand = balance.quantity_on_hand;
        const reserved = balance.quantity_reserved;
        const damaged = balance.quantity_damaged;
        const quarantined = balance.quantity_quarantined;

        let movementType: "ADJUSTMENT" | "LOSS" | "DAMAGE";
        let onHandDelta = 0;
        let damagedDelta = 0;
        let newOnHand = onHand;
        let newDamaged = damaged;

        switch (body.kind) {
          case "loss":
            movementType = "LOSS";
            onHandDelta = -body.quantity;
            newOnHand = onHand - body.quantity;
            break;
          case "damage":
            // Condition transfer: physical units stay, sellable drops.
            movementType = "DAMAGE";
            damagedDelta = body.quantity;
            newDamaged = damaged + body.quantity;
            break;
          case "found":
            movementType = "ADJUSTMENT";
            onHandDelta = body.quantity;
            newOnHand = onHand + body.quantity;
            break;
          case "correction": {
            movementType = "ADJUSTMENT";
            const sign = body.direction === "decrease" ? -1 : 1;
            onHandDelta = sign * body.quantity;
            newOnHand = onHand + onHandDelta;
            break;
          }
        }

        // Enforce the invariant: reserved + damaged + quarantined <= on_hand.
        if (newOnHand < 0) {
          throw new AdjustmentError(409, "INSUFFICIENT_STOCK", `Only ${onHand} units on hand; cannot remove ${body.quantity}.`);
        }
        if (newOnHand < reserved + newDamaged + quarantined) {
          throw new AdjustmentError(
            409,
            "RESERVED_EXCEEDS",
            `This would leave fewer on-hand units than are reserved/damaged/quarantined (${reserved + newDamaged + quarantined}). Release reservations first.`,
          );
        }

        await tx`
          UPDATE inventory_balances
          SET quantity_on_hand = ${newOnHand}, quantity_damaged = ${newDamaged}, updated_at = now()
          WHERE variant_id = ${body.variantId}
        `;
        await tx`
          INSERT INTO stock_movements
            (variant_id, actor_id, movement_type, on_hand_delta, damaged_delta, before_on_hand, after_on_hand,
             source_type, reason, reference)
          VALUES
            (${body.variantId}, ${user.id}, ${movementType}, ${onHandDelta}, ${damagedDelta},
             ${onHand}, ${newOnHand}, 'adjustment', ${body.reason},
             ${body.note?.trim() ? body.note.trim().slice(0, 120) : body.kind})
        `;

        return { onHand, newOnHand, newDamaged };
      });

      await audit(user.id, "stock.adjust", "variant", body.variantId, {
        after: { kind: body.kind, quantity: body.quantity, reason: body.reason, onHand: result.onHand, after: result.newOnHand },
        requestId: c.get("requestId"),
      });
      return ok(c, { onHand: result.newOnHand, damaged: result.newDamaged }, 201);
    } catch (err) {
      if (err instanceof AdjustmentError) return fail(c, err.status, err.code, err.message);
      throw err;
    }
  },
);

class AdjustmentError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

adjustmentRoutes.delete("/:id", requireAuth, requirePermission("adjustments.manage"), async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fail(c, 400, "VALIDATION", "We couldn't tell which adjustment that is.");
  }
  const user = c.get("user");

  try {
    const result = await sql.begin(async (tx) => {
      const rows = await tx<
        { id: string; variant_id: string; on_hand_delta: number; damaged_delta: number; source_type: string }[]
      >`
        SELECT id, variant_id, on_hand_delta, damaged_delta, source_type
        FROM stock_movements
        WHERE id = ${id}
        LIMIT 1
        FOR UPDATE
      `;
      const movement = rows[0];
      if (!movement || movement.source_type !== "adjustment") {
        throw new AdjustmentError(404, "NOT_FOUND", "We couldn't find that adjustment.");
      }
      const balances = await tx<
        { quantity_on_hand: number; quantity_reserved: number; quantity_damaged: number; quantity_quarantined: number }[]
      >`
        SELECT quantity_on_hand, quantity_reserved, quantity_damaged, quantity_quarantined
        FROM inventory_balances
        WHERE variant_id = ${movement.variant_id}
        FOR UPDATE
      `;
      const b = balances[0];
      if (!b) throw new AdjustmentError(404, "VARIANT_NOT_FOUND", "That variant no longer exists.");

      // Reverse the adjustment exactly.
      const newOnHand = b.quantity_on_hand - movement.on_hand_delta;
      const newDamaged = b.quantity_damaged - movement.damaged_delta;
      if (newOnHand < 0) {
        throw new AdjustmentError(409, "INSUFFICIENT_STOCK", "Removing this adjustment would make on-hand negative. Count the shelf first, then try again.");
      }
      if (newDamaged < 0) {
        throw new AdjustmentError(409, "INSUFFICIENT_STOCK", "Removing this adjustment would make the damaged bucket negative — some damaged units were probably counted or sold since.");
      }
      if (newOnHand < b.quantity_reserved + newDamaged + b.quantity_quarantined) {
        throw new AdjustmentError(409, "RESERVED_EXCEEDS", "Removing this adjustment would leave on-hand below the reserved/damaged/quarantined units.");
      }

      await tx`
        UPDATE inventory_balances
        SET quantity_on_hand = ${newOnHand}, quantity_damaged = ${newDamaged}, updated_at = now()
        WHERE variant_id = ${movement.variant_id}
      `;
      await tx`DELETE FROM stock_movements WHERE id = ${id}`;
      return { variantId: movement.variant_id };
    });

    await audit(user.id, "stock.adjustment_delete", "variant", result.variantId, {
      before: { movementId: id },
      requestId: c.get("requestId"),
    });
    return ok(c, { id });
  } catch (err) {
    if (err instanceof AdjustmentError) return fail(c, err.status, err.code, err.message);
    throw err;
  }
});

// ---------- Physical stock count ----------
export const countRoutes = new Hono();

const countBody = z.object({
  scope: z.string().trim().max(80).default("all"),
  note: z.string().trim().max(500).nullable().optional(),
  items: z
    .array(
      z.object({
        variantId: uuidLike,
        counted: z.number().int().min(0, "Counted units cannot be negative.").max(10_000_000),
      }),
    )
    .min(1, "Count at least one variant.")
    .max(500),
});

countRoutes.get("/countable", requireAuth, requirePermission("counts.manage"), async (c) => {
  const params = new URL(c.req.url).searchParams;
  const categoryId = params.get("categoryId") ?? "";
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const like = `%${search}%`;
  if (categoryId && !/^[0-9a-f-]{36}$/i.test(categoryId)) {
    return fail(c, 400, "VALIDATION", "We couldn't tell which category that is. Pick it again and retry.");
  }
  const rows = await sql<
    {
      variant_id: string;
      product_name: string;
      size: string;
      colour: string | null;
      sku: string;
      on_hand: number;
      sellable: number;
      category_id: string | null;
      category: string | null;
    }[]
  >`
    SELECT v.id AS variant_id, p.name AS product_name, v.size, v.colour, v.sku,
           COALESCE(b.quantity_on_hand, 0) AS on_hand,
           COALESCE(b.quantity_on_hand, 0) - COALESCE(b.quantity_reserved, 0)
             - COALESCE(b.quantity_damaged, 0) - COALESCE(b.quantity_quarantined, 0) AS sellable,
           p.category_id, cat.name AS category
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN inventory_balances b ON b.variant_id = v.id
    WHERE v.status = 'active' AND p.status = 'active'
      AND (${categoryId || null}::uuid IS NULL OR p.category_id = ${categoryId || null}::uuid)
      AND (${search === "" ? null : like}::text IS NULL
           OR lower(p.name) LIKE ${like} OR lower(v.sku) LIKE ${like})
    ORDER BY lower(p.name), lower(v.size), lower(COALESCE(v.colour, ''))
    LIMIT 500
  `;
  return ok(c, {
    items: rows.map((r) => ({
      variantId: r.variant_id,
      productName: r.product_name,
      label: r.colour ? `${r.size} / ${r.colour}` : r.size,
      sku: r.sku,
      onHand: r.on_hand,
      sellable: r.sellable,
      category: r.category,
    })),
  });
});

countRoutes.post(
  "/",
  requireAuth,
  requirePermission("counts.manage"),
  zValidator("json", countBody, hook),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");

    try {
      const summary = await sql.begin(async (tx) => {
        const ids = [...new Set(body.items.map((i) => i.variantId))].sort();
        const balances = await tx<
          {
            variant_id: string;
            quantity_on_hand: number;
            quantity_reserved: number;
            quantity_damaged: number;
            quantity_quarantined: number;
            sku: string;
            product_name: string;
          }[]
        >`
          SELECT b.variant_id, b.quantity_on_hand, b.quantity_reserved, b.quantity_damaged, b.quantity_quarantined,
                 v.sku, p.name AS product_name
          FROM inventory_balances b
          JOIN product_variants v ON v.id = b.variant_id
          JOIN products p ON p.id = v.product_id
          WHERE b.variant_id = ANY(${ids})
          ORDER BY b.variant_id
          FOR UPDATE OF b
        `;
        const balanceByVariant = new Map(balances.map((b) => [b.variant_id, b]));

        const countRows = await tx<{ id: string }[]>`
          INSERT INTO stock_counts (scope, note, created_by)
          VALUES (${body.scope}, ${body.note?.trim() || null}, ${user.id})
          RETURNING id
        `;
        const countId = countRows[0]!.id;

        let variances = 0;
        for (const item of body.items) {
          const balance = balanceByVariant.get(item.variantId);
          if (!balance) {
            throw new AdjustmentError(404, "VARIANT_NOT_FOUND", "One of the counted variants no longer exists.");
          }
          const variance = item.counted - balance.quantity_on_hand;
          await tx`
            INSERT INTO stock_count_items (count_id, variant_id, expected, counted)
            VALUES (${countId}, ${item.variantId}, ${balance.quantity_on_hand}, ${item.counted})
          `;
          if (variance === 0) continue;
          variances += 1;

          const after = item.counted;
          if (after < balance.quantity_reserved + balance.quantity_damaged + balance.quantity_quarantined) {
            throw new AdjustmentError(
              409,
              "RESERVED_EXCEEDS",
              `${balance.product_name} (${balance.sku}): counted ${after} is below reserved+damaged+quarantined (${balance.quantity_reserved + balance.quantity_damaged + balance.quantity_quarantined}).`,
            );
          }

          await tx`UPDATE inventory_balances SET quantity_on_hand = ${after}, updated_at = now() WHERE variant_id = ${item.variantId}`;
          await tx`
            INSERT INTO stock_movements
              (variant_id, actor_id, movement_type, on_hand_delta, before_on_hand, after_on_hand,
               source_type, source_id, reason, reference)
            VALUES
              (${item.variantId}, ${user.id}, 'COUNT', ${variance}, ${balance.quantity_on_hand}, ${after},
               'stock_count', ${countId}, 'stocktake', 'stocktake')
          `;
        }

        return { countId, lines: body.items.length, variances };
      });

      await audit(user.id, "stock.count", "stock_count", summary.countId, {
        after: { scope: body.scope, lines: summary.lines, variances: summary.variances },
        requestId: c.get("requestId"),
      });
      return ok(c, summary, 201);
    } catch (err) {
      if (err instanceof AdjustmentError) return fail(c, err.status, err.code, err.message);
      throw err;
    }
  },
);

countRoutes.get("/", requireAuth, requirePermission("counts.manage"), async (c) => {
  const rows = await sql<
    { id: string; created_at: string; scope: string; note: string | null; created_by: string | null; lines: string; variances: string }[]
  >`
    SELECT sc.id, sc.created_at, sc.scope, sc.note, u.name AS created_by,
           COUNT(sci.id)::text AS lines,
           COUNT(sci.id) FILTER (WHERE sci.counted <> sci.expected)::text AS variances
    FROM stock_counts sc
    JOIN users u ON u.id = sc.created_by
    LEFT JOIN stock_count_items sci ON sci.count_id = sc.id
    GROUP BY sc.id, u.name
    ORDER BY sc.created_at DESC
    LIMIT 20
  `;
  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      scope: r.scope,
      note: r.note,
      createdBy: r.created_by,
      lines: Number(r.lines),
      variances: Number(r.variances),
    })),
  });
});

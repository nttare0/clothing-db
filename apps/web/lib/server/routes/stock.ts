import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db";
import { audit, fail, ok, requireAuth, requirePermission } from "../http";
import { zValidator } from "@hono/zod-validator";
import { hook } from "../validate";

export const stockRoutes = new Hono();

const stockInBody = z.object({
  reason: z.enum(["opening_stock", "purchase", "return_from_customer", "correction", "transfer_in"]),
  reference: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().positive("Quantity must be a positive integer.").max(1_000_000),
        unitCost: z.number().finite().min(0, "Cost cannot be negative.").nullable().optional(),
      }),
    )
    .min(1, "Add at least one item.")
    .max(200),
});

stockRoutes.post(
  "/",
  requireAuth,
  requirePermission("stock.receive"),
  zValidator("json", stockInBody, hook),
  async (c) => {
    const body = c.req.valid("json") as z.infer<typeof stockInBody>;
    const user = c.get("user");

    // Merge duplicate variant lines (server-side rule, even if the UI merged them already).
    const merged = new Map<string, { quantity: number; unitCost: number | null }>();
    for (const item of body.items) {
      const existing = merged.get(item.variantId);
      if (existing) {
        existing.quantity += item.quantity;
        if (existing.unitCost === null && item.unitCost != null) existing.unitCost = item.unitCost;
      } else {
        merged.set(item.variantId, { quantity: item.quantity, unitCost: item.unitCost ?? null });
      }
    }
    const lines = [...merged.entries()].map(([variantId, v]) => ({ variantId, ...v }));

    try {
      const purchaseId = await sql.begin(async (tx) => {
        // Lock balance rows in a stable order to avoid deadlocks between cashiers/receivers.
        const ids = lines.map((l) => l.variantId).sort();
        const balances = await tx<
          { variant_id: string; quantity_on_hand: number; moving_average_cost: string }[]
        >`
          SELECT b.variant_id, b.quantity_on_hand, b.moving_average_cost::text
          FROM inventory_balances b
          WHERE b.variant_id = ANY(${ids})
          ORDER BY b.variant_id
          FOR UPDATE OF b
        `;
        const balanceByVariant = new Map(balances.map((b) => [b.variant_id, b]));

        // Validate variants exist (and are not deactivated) before writing anything.
        const variants = await tx<
          { id: string; sku: string; size: string; colour: string | null; product_name: string; status: string }[]
        >`
          SELECT v.id, v.sku, v.size, v.colour, p.name AS product_name, p.status
          FROM product_variants v JOIN products p ON p.id = v.product_id
          WHERE v.id = ANY(${ids})
        `;
        const variantById = new Map(variants.map((v) => [v.id, v]));
        for (const line of lines) {
          const variant = variantById.get(line.variantId);
          if (!variant) throw new StockError(404, "VARIANT_NOT_FOUND", "One of the items no longer exists.");
          if (variant.status !== "active") {
            throw new StockError(409, "VARIANT_DEACTIVATED", `${variant.product_name} (${variant.sku}) is deactivated.`);
          }
        }

        const totalCost = lines.reduce((sum, l) => sum + (l.unitCost ?? 0) * l.quantity, 0);

        const purchaseRows = await tx<{ id: string }[]>`
          INSERT INTO purchases (reference, reason, note, status, received_by, total_cost)
          VALUES (${body.reference?.trim() || null}, ${body.reason}, ${body.note?.trim() || null}, 'received',
                  ${user.id}, ${totalCost.toFixed(2)})
          RETURNING id
        `;
        const purchaseId = purchaseRows[0]!.id;

        for (const line of lines) {
          const lineTotal = (line.unitCost ?? 0) * line.quantity;
          await tx`
            INSERT INTO purchase_items (purchase_id, variant_id, quantity, unit_cost, line_total)
            VALUES (${purchaseId}, ${line.variantId}, ${line.quantity}, ${line.unitCost ?? null}, ${lineTotal.toFixed(2)})
          `;

          const balance = balanceByVariant.get(line.variantId);
          const priorQty = balance?.quantity_on_hand ?? 0;
          const priorMac = balance ? Number(balance.moving_average_cost) : 0;

          let newMac = priorMac;
          if (line.unitCost !== null) {
            const priorValue = priorMac * priorQty;
            const receivedValue = line.unitCost * line.quantity;
            const denom = priorQty + line.quantity;
            newMac = denom > 0 ? (priorValue + receivedValue) / denom : line.unitCost;
          }
          const after = priorQty + line.quantity;

          await tx`
            UPDATE inventory_balances
            SET quantity_on_hand = ${after}, moving_average_cost = ${newMac.toFixed(4)}
            WHERE variant_id = ${line.variantId}
          `;
          await tx`
            INSERT INTO stock_movements
              (variant_id, actor_id, movement_type, on_hand_delta, before_on_hand, after_on_hand,
               source_type, source_id, reason, reference)
            VALUES
              (${line.variantId}, ${user.id}, 'STOCK_IN', ${line.quantity}, ${priorQty}, ${after},
               'purchase', ${purchaseId}, ${body.reason}, ${body.reference?.trim() || purchaseId})
          `;

          await maybeLowStockAlert(tx, line.variantId);
        }

        return purchaseId;
      });

      await audit(user.id, "stock.receive", "purchase", purchaseId, {
        after: { items: lines.length, reason: body.reason, reference: body.reference ?? null },
        requestId: c.get("requestId"),
      });
      return ok(c, { id: purchaseId }, 201);
    } catch (err) {
      if (err instanceof StockError) return fail(c, err.status, err.code, err.message);
      throw err;
    }
  },
);

stockRoutes.get("/", requireAuth, requirePermission("movements.view"), async (c) => {
  const params = new URL(c.req.url).searchParams;
  const search = (params.get("search") ?? "").trim();
  const reason = params.get("reason") ?? "all";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "20") || 20));
  const offset = (page - 1) * pageSize;
  const like = `%${search.toLowerCase()}%`;

  const rows = await sql<
    {
      id: string;
      reference: string | null;
      reason: string;
      received_at: string;
      received_by: string | null;
      item_count: string;
      total_cost: string;
    }[]
  >`
    SELECT pu.id, pu.reference, pu.reason, pu.received_at, u.name AS received_by,
           COUNT(pi.id)::text AS item_count, COALESCE(pu.total_cost, 0)::text AS total_cost
    FROM purchases pu
    JOIN users u ON u.id = pu.received_by
    LEFT JOIN purchase_items pi ON pi.purchase_id = pu.id
    WHERE pu.status = 'received'
      AND (${reason === "all" ? null : reason}::text IS NULL OR pu.reason = ${reason === "all" ? null : reason}::text)
      AND (${search === "" ? null : like}::text IS NULL OR lower(COALESCE(pu.reference, '')) LIKE ${like})
    GROUP BY pu.id, u.name
    ORDER BY pu.received_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const countRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM purchases pu
    WHERE pu.status = 'received'
      AND (${reason === "all" ? null : reason}::text IS NULL OR pu.reason = ${reason === "all" ? null : reason}::text)
      AND (${search === "" ? null : like}::text IS NULL OR lower(COALESCE(pu.reference, '')) LIKE ${like})
  `;

  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      reason: r.reason,
      receivedAt: r.received_at,
      receivedBy: r.received_by,
      itemCount: Number(r.item_count),
      totalCost: Number(r.total_cost),
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  });
});

class StockError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Accepts the postgres.js transaction handle (loosely typed: TransactionSql is a call-compatible subset).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function maybeLowStockAlert(
  tx: any,
  variantId: string,
): Promise<void> {
  const rows = await tx<
    { sellable: number; reorder_level: number; product_name: string; sku: string; size: string; colour: string | null }[]
  >`
    SELECT (COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0)
            - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0)) AS sellable,
           v.reorder_level, p.name AS product_name, v.sku, v.size, v.colour
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN inventory_balances b ON b.variant_id = v.id
    WHERE v.id = ${variantId}
  `;
  const row = rows[0];
  if (!row || row.sellable > row.reorder_level) return;

  // Blueprint: do not repeatedly create identical low-stock alerts.
  const recent = await tx<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM notifications
    WHERE type = 'low_stock' AND entity_id = ${variantId} AND created_at > now() - interval '7 days'
  `;
  if (Number(recent[0]?.count ?? 0) > 0) return;

  const label = row.colour ? `${row.size} / ${row.colour}` : row.size;
  await tx`
    INSERT INTO notifications (type, severity, title, body, action_href, action_label, entity_type, entity_id)
    VALUES ('low_stock', 'warning',
            ${`${row.product_name} (${label}) is low on stock`},
            ${`Sellable: ${row.sellable} · reorder level ${row.reorder_level} · SKU ${row.sku}`},
            ${'/inventory?lowStock=1'}, 'Open inventory', 'variant', ${variantId})
  `;
}

import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db";
import { audit, fail, ok, requireAuth, requirePermission } from "../http";
import { zValidator } from "@hono/zod-validator";
import { hook, uuidLike } from "../validate";

export const returnsRoutes = new Hono();

// Per-line return eligibility for one sale (used by the return form).
returnsRoutes.get("/eligibility", requireAuth, requirePermission("returns.process"), async (c) => {
  const saleId = new URL(c.req.url).searchParams.get("saleId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(saleId)) return fail(c, 400, "VALIDATION", "We couldn't find that sale. Go back to Sales history and try again.");

  const rows = await sql<
    {
      sale_item_id: string;
      variant_id: string | null;
      product_name: string;
      variant_label: string;
      sku: string;
      unit_price: string;
      unit_cost: string;
      sold: number;
      returned: string;
    }[]
  >`
    SELECT si.id AS sale_item_id, si.variant_id, si.product_name, si.variant_label, si.sku,
           si.unit_price::text, si.unit_cost::text, si.quantity AS sold,
           COALESCE(SUM(ri.quantity), 0)::text AS returned
    FROM sale_items si
    LEFT JOIN return_items ri ON ri.sale_item_id = si.id
    WHERE si.sale_id = ${saleId}
    GROUP BY si.id
    ORDER BY si.product_name, si.variant_label
  `;
  if (rows.length === 0) return fail(c, 404, "NOT_FOUND", "Sale not found.");

  const sale = await sql<{ receipt_number: string; total: string; completed_at: string; return_status: string; cashier_name: string | null }[]>`
    SELECT s.receipt_number, s.total::text, s.completed_at, s.return_status, u.name AS cashier_name
    FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
    WHERE s.id = ${saleId} LIMIT 1
  `;

  return ok(c, {
    saleId,
    receiptNumber: sale[0]?.receipt_number ?? null,
    completedAt: sale[0]?.completed_at ?? null,
    returnStatus: sale[0]?.return_status ?? "none",
    items: rows.map((r) => {
      const returned = Number(r.returned);
      return {
        saleItemId: r.sale_item_id,
        variantId: r.variant_id,
        productName: r.product_name,
        variantLabel: r.variant_label,
        sku: r.sku,
        unitPrice: Number(r.unit_price),
        unitCost: Number(r.unit_cost),
        sold: r.sold,
        returned,
        returnable: Math.max(0, r.sold - returned),
      };
    }),
  });
});

const returnBody = z.object({
  saleId: uuidLike,
  reason: z.string().trim().min(1, "Reason is required.").max(80).default("customer_return"),
  note: z.string().trim().max(500).nullable().optional(),
  refundMethod: z.enum(["cash", "mobile_money", "card", "bank_transfer", "store_credit"]).nullable().optional(),
  items: z
    .array(
      z.object({
        saleItemId: uuidLike,
        quantity: z.number().int().positive("Quantity must be at least 1.").max(10_000),
        disposition: z.enum(["resellable", "damaged", "quarantine"]).default("resellable"),
      }),
    )
    .min(1, "Add at least one item to return.")
    .max(200),
});

returnsRoutes.post(
  "/",
  requireAuth,
  requirePermission("returns.process"),
  zValidator("json", returnBody, hook),
  async (c) => {
    const body = c.req.valid("json") as z.infer<typeof returnBody>;
    const user = c.get("user");

    try {
      const created = await sql.begin(async (tx) => {
        // Lock the sale row so concurrent returns cannot over-refund it.
        const sales = await tx<
          { id: string; receipt_number: string; return_status: string }[]
        >`SELECT id, receipt_number, return_status FROM sales WHERE id = ${body.saleId} FOR UPDATE`;
        const sale = sales[0];
        if (!sale) throw new ReturnError(404, "NOT_FOUND", "Sale not found.");

        const itemIds = [...new Set(body.items.map((i) => i.saleItemId))];
        const soldRows = await tx<
          {
            id: string;
            variant_id: string | null;
            product_name: string;
            variant_label: string;
            sku: string;
            unit_price: string;
            unit_cost: string;
            quantity: number;
            returned: string;
          }[]
        >`
          SELECT si.id, si.variant_id, si.product_name, si.variant_label, si.sku,
                 si.unit_price::text, si.unit_cost::text, si.quantity,
                 COALESCE((
                   SELECT SUM(ri.quantity) FROM return_items ri
                   JOIN returns r ON r.id = ri.return_id
                   WHERE ri.sale_item_id = si.id
                 ), 0)::text AS returned
          FROM sale_items si
          WHERE si.sale_id = ${body.saleId} AND si.id = ANY(${itemIds})
        `;
        const soldById = new Map(soldRows.map((r) => [r.id, r]));

        let refundTotal = 0;
        const lines = body.items.map((item) => {
          const sold = soldById.get(item.saleItemId);
          if (!sold) throw new ReturnError(400, "VALIDATION", "One of the items does not belong to this sale.");
          const returnable = sold.quantity - Number(sold.returned);
          if (item.quantity > returnable) {
            throw new ReturnError(
              409,
              "RETURN_EXCEEDS_SOLD",
              `Cannot return ${item.quantity} × ${sold.product_name} (${sold.sku}); only ${returnable} can still be returned.`,
            );
          }
          const unitRefund = Number(sold.unit_price);
          refundTotal += unitRefund * item.quantity;
          return {
            ...item,
            sold,
            unitRefund,
            lineTotal: Math.round(unitRefund * item.quantity * 100) / 100,
          };
        });
        refundTotal = Math.round(refundTotal * 100) / 100;

        const returnRows = await tx<{ id: string; created_at: string }[]>`
          INSERT INTO returns (sale_id, processed_by, reason, note, refund_method, refund_total)
          VALUES (${body.saleId}, ${user.id}, ${body.reason}, ${body.note?.trim() || null},
                  ${body.refundMethod ?? null}, ${refundTotal.toFixed(2)})
          RETURNING id, created_at
        `;
        const ret = returnRows[0]!;

        // Lock balances for affected variants (stable order) and post RETURN movements.
        const variantIds = [...new Set(lines.map((l) => l.sold.variant_id).filter((v): v is string => !!v))].sort();
        const balances = await tx<
          { variant_id: string; quantity_on_hand: number; quantity_reserved: number; quantity_damaged: number; quantity_quarantined: number }[]
        >`
          SELECT variant_id, quantity_on_hand, quantity_reserved, quantity_damaged, quantity_quarantined
          FROM inventory_balances
          WHERE variant_id = ANY(${variantIds})
          ORDER BY variant_id
          FOR UPDATE
        `;
        const balanceByVariant = new Map(balances.map((b) => [b.variant_id, b]));

        for (const line of lines) {
          await tx`
            INSERT INTO return_items (return_id, sale_item_id, variant_id, quantity, disposition, unit_refund)
            VALUES (${ret.id}, ${line.saleItemId}, ${line.sold.variant_id}, ${line.quantity}, ${line.disposition}, ${line.unitRefund.toFixed(2)})
          `;
          const vid = line.sold.variant_id;
          if (!vid) continue; // line snapshot kept, no stock to move back
          const balance = balanceByVariant.get(vid);
          const priorOnHand = balance?.quantity_on_hand ?? 0;
          const priorDamaged = balance?.quantity_damaged ?? 0;
          const priorQuarantine = balance?.quantity_quarantined ?? 0;
          const after = priorOnHand + line.quantity;
          const afterDamaged = line.disposition === "damaged" ? priorDamaged + line.quantity : priorDamaged;
          const afterQuarantine = line.disposition === "quarantine" ? priorQuarantine + line.quantity : priorQuarantine;

          await tx`
            INSERT INTO inventory_balances (variant_id, quantity_on_hand, quantity_damaged, quantity_quarantined)
            VALUES (${vid}, ${after}, ${afterDamaged}, ${afterQuarantine})
            ON CONFLICT (variant_id) DO UPDATE SET
              quantity_on_hand = EXCLUDED.quantity_on_hand,
              quantity_damaged = EXCLUDED.quantity_damaged,
              quantity_quarantined = EXCLUDED.quantity_quarantined,
              updated_at = now()
          `;
          await tx`
            INSERT INTO stock_movements
              (variant_id, actor_id, movement_type, on_hand_delta, damaged_delta, quarantined_delta,
               before_on_hand, after_on_hand, source_type, source_id, reason, reference)
            VALUES
              (${vid}, ${user.id}, 'RETURN', ${line.quantity},
               ${line.disposition === "damaged" ? line.quantity : 0},
               ${line.disposition === "quarantine" ? line.quantity : 0},
               ${priorOnHand}, ${after}, 'return', ${ret.id}, ${body.reason}, ${sale.receipt_number})
          `;
        }

        // Recompute sale return_status from units.
        const totals = await tx<{ sold: string; returned: string }[]>`
          SELECT COALESCE(SUM(si.quantity), 0)::text AS sold,
                 COALESCE((
                   SELECT SUM(ri.quantity) FROM return_items ri
                   JOIN sale_items si2 ON si2.id = ri.sale_item_id
                   WHERE si2.sale_id = ${body.saleId}
                 ), 0)::text AS returned
          FROM sale_items si WHERE si.sale_id = ${body.saleId}
        `;
        const soldUnits = Number(totals[0]?.sold ?? 0);
        const returnedUnits = Number(totals[0]?.returned ?? 0);
        const returnStatus = returnedUnits >= soldUnits && soldUnits > 0 ? "full" : returnedUnits > 0 ? "partial" : "none";
        await tx`UPDATE sales SET return_status = ${returnStatus} WHERE id = ${body.saleId}`;

        return { ret, refundTotal, receiptNumber: sale.receipt_number };
      });

      await audit(user.id, "return.process", "return", created.ret.id, {
        after: { saleId: body.saleId, receiptNumber: created.receiptNumber, refundTotal: created.refundTotal, items: body.items.length },
        requestId: c.get("requestId"),
      });
      return ok(c, { id: created.ret.id, refundTotal: created.refundTotal }, 201);
    } catch (err) {
      if (err instanceof ReturnError) return fail(c, err.status, err.code, err.message);
      throw err;
    }
  },
);

returnsRoutes.get("/", requireAuth, requirePermission("returns.process"), async (c) => {
  const params = new URL(c.req.url).searchParams;
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "20") || 20));
  const offset = (page - 1) * pageSize;
  const like = `%${search}%`;

  const rows = await sql<
    {
      id: string;
      created_at: string;
      receipt_number: string;
      sale_id: string;
      refund_method: string | null;
      refund_total: string;
      items: string;
      reason: string;
      processed_by: string | null;
    }[]
  >`
    SELECT r.id, r.created_at, s.receipt_number, s.id AS sale_id, r.refund_method, r.refund_total::text,
           COALESCE((SELECT SUM(ri.quantity) FROM return_items ri WHERE ri.return_id = r.id), 0)::text AS items,
           r.reason, u.name AS processed_by
    FROM returns r
    JOIN sales s ON s.id = r.sale_id
    LEFT JOIN users u ON u.id = r.processed_by
    WHERE ${search === "" ? sql`TRUE` : sql`lower(s.receipt_number) LIKE ${like}`}
    ORDER BY r.created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const countRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM returns r JOIN sales s ON s.id = r.sale_id
    WHERE ${search === "" ? sql`TRUE` : sql`lower(s.receipt_number) LIKE ${like}`}
  `;

  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      receiptNumber: r.receipt_number,
      saleId: r.sale_id,
      refundMethod: r.refund_method,
      refundTotal: Number(r.refund_total),
      items: Number(r.items),
      reason: r.reason,
      processedBy: r.processed_by,
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  });
});

returnsRoutes.get("/:id", requireAuth, requirePermission("returns.process"), async (c) => {
  const id = c.req.param("id");
  const rows = await sql<{ id: string; created_at: string; receipt_number: string; refund_method: string | null; refund_total: string; reason: string; note: string | null; processed_by: string | null }[]>`
    SELECT r.id, r.created_at, s.receipt_number, r.refund_method, r.refund_total::text, r.reason, r.note, u.name AS processed_by
    FROM returns r JOIN sales s ON s.id = r.sale_id LEFT JOIN users u ON u.id = r.processed_by
    WHERE r.id = ${id} LIMIT 1
  `;
  const ret = rows[0];
  if (!ret) return fail(c, 404, "NOT_FOUND", "Return not found.");
  const items = await sql<{ id: string; product_name: string | null; variant_label: string | null; sku: string | null; quantity: number; disposition: string; unit_refund: string }[]>`
    SELECT ri.id, si.product_name, si.variant_label, si.sku, ri.quantity, ri.disposition, ri.unit_refund::text
    FROM return_items ri JOIN sale_items si ON si.id = ri.sale_item_id
    WHERE ri.return_id = ${id} ORDER BY si.product_name
  `;
  return ok(c, {
    id: ret.id,
    createdAt: ret.created_at,
    receiptNumber: ret.receipt_number,
    refundMethod: ret.refund_method,
    refundTotal: Number(ret.refund_total),
    reason: ret.reason,
    note: ret.note,
    processedBy: ret.processed_by,
    items: items.map((i) => ({ ...i, unitRefund: Number(i.unit_refund) })),
  });
});

class ReturnError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

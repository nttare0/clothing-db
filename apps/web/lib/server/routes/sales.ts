import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db";
import { audit, fail, ok, requireAuth, requirePermission } from "../http";
import { zValidator } from "@hono/zod-validator";
import { hook } from "../validate";
import { maybeLowStockAlert } from "./stock";
import { maybeRemoveDemo } from "../demo";

export const salesRoutes = new Hono();

const saleBody = z.object({
  customerPhone: z.string().trim().max(40).nullable().optional(),
  discountTotal: z.number().finite().min(0, "Discount cannot be negative.").default(0),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().positive("Quantity must be a positive integer.").max(10_000),
      }),
    )
    .min(1, "Add at least one item.")
    .max(200),
  payments: z
    .array(
      z.object({
        method: z.enum(["cash", "mobile_money", "card", "bank_transfer"]),
        amount: z.number().finite().min(0),
        reference: z.string().trim().max(120).nullable().optional(),
      }),
    )
    .min(1, "Add at least one payment.")
    .max(10),
});

type SalePayload = {
  id: string;
  receiptNumber: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  changeDue: number;
  completedAt: string;
  cashierName: string | null;
  customerPhone: string | null;
  returnStatus: string;
  items: {
    id: string;
    productId: string | null;
    label: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  payments: { method: string; amount: number; reference: string | null }[];
};

salesRoutes.post(
  "/",
  requireAuth,
  requirePermission("pos.sale"),
  zValidator("json", saleBody, hook),
  async (c) => {
    const body = c.req.valid("json") as z.infer<typeof saleBody>;
    const user = c.get("user");
    const idempotencyKey = c.req.header("Idempotency-Key")?.trim() || null;
    if (!idempotencyKey) {
      return fail(c, 400, "IDEMPOTENCY_KEY_REQUIRED", "Missing Idempotency-Key header.");
    }

    // Replay protection: same key returns the original sale, never a second one.
    const existing = await fetchSaleByIdempotencyKey(idempotencyKey);
    if (existing) return ok(c, existing, 200);

    // Merge duplicate cart lines (server rule).
    const qtyByVariant = new Map<string, number>();
    for (const item of body.items) {
      qtyByVariant.set(item.variantId, (qtyByVariant.get(item.variantId) ?? 0) + item.quantity);
    }
    const lines = [...qtyByVariant.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));

    try {
      const sale = await sql.begin(async (tx) => {
        const ids = lines.map((l) => l.variantId).sort();

        // Lock balances in deterministic order; two cashiers cannot sell the same final unit.
        const balances = await tx<
          {
            variant_id: string;
            quantity_on_hand: number;
            quantity_reserved: number;
            quantity_damaged: number;
            quantity_quarantined: number;
            moving_average_cost: string;
          }[]
        >`
          SELECT variant_id, quantity_on_hand, quantity_reserved, quantity_damaged, quantity_quarantined,
                 moving_average_cost::text
          FROM inventory_balances
          WHERE variant_id = ANY(${ids})
          ORDER BY variant_id
          FOR UPDATE
        `;
        const balanceByVariant = new Map(balances.map((b) => [b.variant_id, b]));

        const variants = await tx<
          {
            id: string;
            product_id: string;
            product_name: string;
            size: string;
            colour: string | null;
            sku: string;
            selling_price: string | null;
            product_status: string;
            variant_status: string;
          }[]
        >`
          SELECT v.id, v.product_id, p.name AS product_name, v.size, v.colour, v.sku,
                 v.selling_price::text, p.status AS product_status, v.status AS variant_status
          FROM product_variants v JOIN products p ON p.id = v.product_id
          WHERE v.id = ANY(${ids})
        `;
        const variantById = new Map(variants.map((v) => [v.id, v]));

        // Server recalculates everything. Browser prices/stock are never trusted.
        let subtotal = 0;
        const computed = lines.map((line) => {
          const variant = variantById.get(line.variantId);
          if (!variant) throw new SaleError(404, "VARIANT_NOT_FOUND", "One of the items no longer exists.");
          if (variant.product_status !== "active" || variant.variant_status !== "active") {
            throw new SaleError(409, "VARIANT_DEACTIVATED", `${variant.product_name} (${variant.sku}) is not available for sale.`);
          }
          if (variant.selling_price === null) {
            throw new SaleError(409, "PRICE_MISSING", `${variant.product_name} (${variant.sku}) has no selling price.`);
          }
          const balance = balanceByVariant.get(line.variantId);
          const onHand = balance?.quantity_on_hand ?? 0;
          const reserved = balance?.quantity_reserved ?? 0;
          const damaged = balance?.quantity_damaged ?? 0;
          const quarantined = balance?.quantity_quarantined ?? 0;
          const sellable = onHand - reserved - damaged - quarantined;
          if (line.quantity > sellable) {
            throw new SaleError(
              409,
              "INSUFFICIENT_STOCK",
              `This quantity is greater than the available stock for ${variant.product_name} (${variant.sku}). Available: ${sellable}.`,
            );
          }
          const unitPrice = Number(variant.selling_price);
          const lineTotal = round2(unitPrice * line.quantity);
          subtotal = round2(subtotal + lineTotal);
          return {
            ...line,
            variant,
            unitPrice,
            lineTotal,
            unitCost: balance ? Number(balance.moving_average_cost) : 0,
            priorOnHand: onHand,
          };
        });

        const discount = Math.min(body.discountTotal, subtotal);
        const total = round2(subtotal - discount);
        const paid = round2(body.payments.reduce((sum, p) => sum + p.amount, 0));
        if (paid < total) {
          throw new SaleError(400, "UNDERPAID", `Payments total ${paid.toFixed(2)} RWF, which is less than the amount due (${total.toFixed(2)} RWF).`);
        }
        const hasCash = body.payments.some((p) => p.method === "cash" && p.amount > 0);
        if (paid > total && !hasCash) {
          throw new SaleError(400, "OVERPAY_NOT_CASH", "Overpayment is only allowed in cash, where change due can be given.");
        }
        const changeDue = hasCash && paid > total ? round2(paid - total) : 0;

        const receiptRows = await tx<{ receipt_number: string }[]>`
          SELECT 'R-' || lpad(nextval('receipt_seq')::text, 6, '0') AS receipt_number
        `;
        const receiptNumber = receiptRows[0]!.receipt_number;

        const saleRows = await tx<{ id: string; completed_at: string }[]>`
          INSERT INTO sales (receipt_number, cashier_id, customer_phone, subtotal, discount_total, total, change_due, idempotency_key)
          VALUES (${receiptNumber}, ${user.id}, ${body.customerPhone?.trim() || null},
                  ${subtotal.toFixed(2)}, ${discount.toFixed(2)}, ${total.toFixed(2)}, ${changeDue.toFixed(2)},
                  ${idempotencyKey})
          RETURNING id, completed_at
        `;
        const saleRow = saleRows[0]!;

        for (const item of computed) {
          const v = item.variant;
          const label = v.colour ? `${v.size} / ${v.colour}` : v.size;
          await tx`
            INSERT INTO sale_items
              (sale_id, variant_id, product_id, product_name, variant_label, sku, quantity, unit_price, unit_cost, line_total)
            VALUES
              (${saleRow.id}, ${item.variantId}, ${v.product_id}, ${v.product_name}, ${label}, ${v.sku},
               ${item.quantity}, ${item.unitPrice.toFixed(2)}, ${item.unitCost.toFixed(4)}, ${item.lineTotal.toFixed(2)})
          `;
          const after = item.priorOnHand - item.quantity;
          await tx`UPDATE inventory_balances SET quantity_on_hand = ${after} WHERE variant_id = ${item.variantId}`;
          await tx`
            INSERT INTO stock_movements
              (variant_id, actor_id, movement_type, on_hand_delta, before_on_hand, after_on_hand,
               source_type, source_id, reason, reference)
            VALUES
              (${item.variantId}, ${user.id}, 'SALE', ${-item.quantity}, ${item.priorOnHand}, ${after},
               'sale', ${saleRow.id}, 'sale', ${receiptNumber})
          `;
          await maybeLowStockAlert(tx, item.variantId);
        }

        for (const payment of body.payments.filter((p) => p.amount > 0)) {
          await tx`
            INSERT INTO payments (sale_id, method, amount, reference)
            VALUES (${saleRow.id}, ${payment.method}, ${payment.amount.toFixed(2)}, ${payment.reference?.trim() || null})
          `;
        }

        return { saleRow, computed, receiptNumber, subtotal, discount, total, changeDue };
      });

      const payload = await fetchSaleById(sale.saleRow.id);
      await audit(user.id, "sale.complete", "sale", sale.saleRow.id, {
        after: { receiptNumber: sale.receiptNumber, total: sale.total },
        requestId: c.get("requestId"),
      });
      await maybeRemoveDemo(user.id, c.get("requestId"));
      return ok(c, payload, 201);
    } catch (err) {
      if (err instanceof SaleError) return fail(c, err.status, err.code, err.message);
      // Concurrent replay of the same idempotency key: return the stored sale.
      if (isUniqueViolation(err)) {
        const existing = await fetchSaleByIdempotencyKey(idempotencyKey);
        if (existing) return ok(c, existing, 200);
      }
      throw err;
    }
  },
);

salesRoutes.get("/", requireAuth, requirePermission("sales.view"), async (c) => {
  const params = new URL(c.req.url).searchParams;
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const status = params.get("status") ?? "all";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "20") || 20));
  const offset = (page - 1) * pageSize;
  const like = `%${search}%`;

  const rows = await sql<
    {
      id: string;
      receipt_number: string;
      completed_at: string;
      cashier_name: string | null;
      total: string;
      payment_methods: string[] | null;
      return_status: string;
    }[]
  >`
    SELECT s.id, s.receipt_number, s.completed_at, u.name AS cashier_name, s.total::text,
           (SELECT array_agg(DISTINCT p.method ORDER BY p.method) FROM payments p WHERE p.sale_id = s.id) AS payment_methods,
           s.return_status
    FROM sales s
    LEFT JOIN users u ON u.id = s.cashier_id
    WHERE
      (${status} = 'all'
        OR (${status} = 'returned' AND s.return_status <> 'none')
        OR (${status} = 'completed' AND s.return_status = 'none'))
      AND (${search === "" ? null : like}::text IS NULL OR lower(s.receipt_number) LIKE ${like})
    ORDER BY s.completed_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const countRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM sales s
    WHERE
      (${status} = 'all'
        OR (${status} = 'returned' AND s.return_status <> 'none')
        OR (${status} = 'completed' AND s.return_status = 'none'))
      AND (${search === "" ? null : like}::text IS NULL OR lower(s.receipt_number) LIKE ${like})
  `;

  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      receiptNumber: r.receipt_number,
      completedAt: r.completed_at,
      cashierName: r.cashier_name,
      total: Number(r.total),
      paymentMethods: r.payment_methods ?? [],
      returnStatus: r.return_status,
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  });
});

salesRoutes.get("/:id", requireAuth, requirePermission("sales.view"), async (c) => {
  const sale = await fetchSaleById(c.req.param("id"));
  if (!sale) return fail(c, 404, "NOT_FOUND", "Sale not found.");
  return ok(c, sale);
});

async function fetchSaleByIdempotencyKey(key: string): Promise<SalePayload | null> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM sales WHERE idempotency_key = ${key} LIMIT 1`;
  const row = rows[0];
  return row ? fetchSaleById(row.id) : null;
}

async function fetchSaleById(id: string): Promise<SalePayload | null> {
  const sales = await sql<
    {
      id: string;
      receipt_number: string;
      completed_at: string;
      subtotal: string;
      discount_total: string;
      total: string;
      change_due: string;
      customer_phone: string | null;
      cashier_name: string | null;
      return_status: string;
    }[]
  >`
    SELECT s.id, s.receipt_number, s.completed_at, s.subtotal::text, s.discount_total::text, s.total::text,
           s.change_due::text, s.customer_phone, u.name AS cashier_name, s.return_status
    FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
    WHERE s.id = ${id} LIMIT 1
  `;
  const sale = sales[0];
  if (!sale) return null;

  const items = await sql<
    {
      id: string;
      variant_id: string | null;
      product_id: string | null;
      product_name: string;
      variant_label: string;
      sku: string;
      quantity: number;
      unit_price: string;
      line_total: string;
    }[]
  >`
    SELECT id, variant_id, product_id, product_name, variant_label, sku, quantity, unit_price::text, line_total::text
    FROM sale_items WHERE sale_id = ${id} ORDER BY product_name, variant_label
  `;

  const payments = await sql<{ method: string; amount: string; reference: string | null }[]>`
    SELECT method, amount::text, reference FROM payments WHERE sale_id = ${id} ORDER BY recorded_at
  `;

  return {
    id: sale.id,
    receiptNumber: sale.receipt_number,
    completedAt: sale.completed_at,
    cashierName: sale.cashier_name,
    customerPhone: sale.customer_phone,
    returnStatus: sale.return_status,
    subtotal: Number(sale.subtotal),
    discountTotal: Number(sale.discount_total),
    total: Number(sale.total),
    changeDue: Number(sale.change_due),
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      label: i.variant_label,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.line_total),
    })),
    payments: payments.map((p) => ({ method: p.method, amount: Number(p.amount), reference: p.reference })),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

class SaleError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

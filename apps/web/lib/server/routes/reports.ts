import { Hono } from "hono";
import { sql } from "../db";
import { ok, requireAuth, requirePermission } from "../http";

// Range helpers shared by all report endpoints. Store-local time (Kigali, UTC+2, no DST).
const KIGALI_OFFSET_MINUTES = 120;

function kigaliStartOfDay(offsetDays = 0): Date {
  const now = new Date();
  const kigali = new Date(now.getTime() + KIGALI_OFFSET_MINUTES * 60_000);
  return new Date(Date.UTC(kigali.getUTCFullYear(), kigali.getUTCMonth(), kigali.getUTCDate() + offsetDays) - KIGALI_OFFSET_MINUTES * 60_000);
}

function resolveRange(c: { req: { url: string } }): { from: Date; to: Date; label: string } {
  const params = new URL(c.req.url).searchParams;
  const fromParam = params.get("from") ?? "";
  const toParam = params.get("to") ?? "";
  const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (dateOk(fromParam) && dateOk(toParam) && fromParam <= toParam) {
    const from = new Date(`${fromParam}T00:00:00+02:00`);
    const to = new Date(new Date(`${toParam}T00:00:00+02:00`).getTime() + 86_400_000);
    return { from, to, label: `${fromParam} → ${toParam}` };
  }
  const range = params.get("range") ?? "30d";
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
  return { from: kigaliStartOfDay(-(days - 1)), to: new Date(kigaliStartOfDay(0).getTime() + 86_400_000), label: range };
}

export const reportRoutes = new Hono();

reportRoutes.get("/sales", requireAuth, requirePermission("reports.view"), async (c) => {
  const { from, to, label } = resolveRange(c);

  const [summary, byDay, byMethod] = await Promise.all([
    sql<{ gross: string; discounts: string; refunds: string; transactions: string }[]>`
      SELECT COALESCE(SUM(s.total + s.discount_total), 0)::text AS gross,
             COALESCE(SUM(s.discount_total), 0)::text AS discounts,
             (SELECT COALESCE(SUM(r.refund_total), 0) FROM returns r WHERE r.created_at >= ${from} AND r.created_at < ${to})::text AS refunds,
             COUNT(*)::text AS transactions
      FROM sales s
      WHERE s.status = 'completed' AND s.completed_at >= ${from} AND s.completed_at < ${to}
    `,
    sql<{ day: string; total: string; count: string }[]>`
      SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(s.total), 0)::text AS total,
             COUNT(s.id)::text AS count
      FROM generate_series(${from}::timestamptz, ${new Date(to.getTime() - 86_400_000)}::timestamptz, interval '1 day') AS days(day)
      LEFT JOIN sales s ON s.status = 'completed' AND s.completed_at >= days.day AND s.completed_at < days.day + interval '1 day'
      GROUP BY days.day ORDER BY days.day
    `,
    sql<{ method: string; amount: string }[]>`
      SELECT p.method, COALESCE(SUM(p.amount), 0)::text AS amount
      FROM payments p JOIN sales s ON s.id = p.sale_id
      WHERE s.status = 'completed' AND s.completed_at >= ${from} AND s.completed_at < ${to} AND p.status = 'recorded'
      GROUP BY p.method ORDER BY SUM(p.amount) DESC
    `,
  ]);

  const gross = Number(summary[0]?.gross ?? 0);
  const refunds = Number(summary[0]?.refunds ?? 0);
  const transactions = Number(summary[0]?.transactions ?? 0);
  const net = Math.max(0, gross - Number(summary[0]?.discounts ?? 0) - refunds);

  return ok(c, {
    range: label,
    grossSales: gross,
    discounts: Number(summary[0]?.discounts ?? 0),
    refunds,
    netSales: net,
    transactions,
    averageBasket: transactions > 0 ? net / transactions : 0,
    byDay: byDay.map((r) => ({ date: r.day, total: Number(r.total), transactions: Number(r.count) })),
    byPaymentMethod: byMethod.map((r) => ({ method: r.method, amount: Number(r.amount) })),
  });
});

reportRoutes.get("/inventory", requireAuth, requirePermission("reports.view"), async (c) => {
  const [summary, lowStock, categories] = await Promise.all([
    sql<{ units: string; sellable: string; reserved: string; damaged: string; quarantined: string; value: string; skus: string }[]>`
      SELECT COALESCE(SUM(b.quantity_on_hand), 0)::text AS units,
             COALESCE(SUM(b.quantity_on_hand - b.quantity_reserved - b.quantity_damaged - b.quantity_quarantined), 0)::text AS sellable,
             COALESCE(SUM(b.quantity_reserved), 0)::text AS reserved,
             COALESCE(SUM(b.quantity_damaged), 0)::text AS damaged,
             COALESCE(SUM(b.quantity_quarantined), 0)::text AS quarantined,
             COALESCE(SUM(b.quantity_on_hand * b.moving_average_cost), 0)::text AS value,
             COUNT(*)::text AS skus
      FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN inventory_balances b ON b.variant_id = v.id
      WHERE v.status = 'active' AND p.status = 'active'
    `,
    sql<{ variant_id: string; product_name: string; size: string; colour: string | null; sku: string; sellable: number; reorder_level: number }[]>`
      SELECT v.id AS variant_id, p.name AS product_name, v.size, v.colour, v.sku,
             (b.quantity_on_hand - b.quantity_reserved - b.quantity_damaged - b.quantity_quarantined) AS sellable,
             v.reorder_level
      FROM product_variants v JOIN products p ON p.id = v.product_id
      LEFT JOIN inventory_balances b ON b.variant_id = v.id
      WHERE v.status = 'active' AND p.status = 'active'
        AND (COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0) - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0)) <= v.reorder_level
      ORDER BY sellable ASC, p.name
      LIMIT 20
    `,
    sql<{ name: string; units: string; value: string }[]>`
      SELECT COALESCE(cat.name, 'Uncategorised') AS name,
             COALESCE(SUM(b.quantity_on_hand), 0)::text AS units,
             COALESCE(SUM(b.quantity_on_hand * b.moving_average_cost), 0)::text AS value
      FROM product_variants v JOIN products p ON p.id = v.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      LEFT JOIN inventory_balances b ON b.variant_id = v.id
      WHERE v.status = 'active' AND p.status = 'active'
      GROUP BY cat.name ORDER BY SUM(b.quantity_on_hand * b.moving_average_cost) DESC NULLS LAST
    `,
  ]);

  const s = summary[0];
  return ok(c, {
    generatedAt: new Date().toISOString(),
    costingMethod: "moving_average",
    totalUnits: Number(s?.units ?? 0),
    sellableUnits: Number(s?.sellable ?? 0),
    reservedUnits: Number(s?.reserved ?? 0),
    damagedUnits: Number(s?.damaged ?? 0),
    quarantinedUnits: Number(s?.quarantined ?? 0),
    activeSkus: Number(s?.skus ?? 0),
    inventoryValue: Number(s?.value ?? 0),
    lowStock: lowStock.map((r) => ({
      variantId: r.variant_id,
      productName: r.product_name,
      label: r.colour ? `${r.size} / ${r.colour}` : r.size,
      sku: r.sku,
      sellable: Math.max(0, r.sellable),
      reorderLevel: r.reorder_level,
    })),
    byCategory: categories.map((r) => ({ category: r.name, units: Number(r.units), value: Number(r.value) })),
  });
});

reportRoutes.get("/pnl", requireAuth, requirePermission("reports.view"), async (c) => {
  const { from, to, label } = resolveRange(c);

  const [salesAgg, cogsAgg, returnsAgg, expensesAgg] = await Promise.all([
    sql<{ net_sales: string; discounts: string; count: string }[]>`
      SELECT COALESCE(SUM(total), 0)::text AS net_sales,
             COALESCE(SUM(discount_total), 0)::text AS discounts,
             COUNT(*)::text AS count
      FROM sales
      WHERE status = 'completed' AND completed_at >= ${from} AND completed_at < ${to}
    `,
    sql<{ cogs: string }[]>`
      SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0)::text AS cogs
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'completed' AND s.completed_at >= ${from} AND s.completed_at < ${to}
    `,
    sql<{ returned_cogs: string; refunds: string }[]>`
      SELECT COALESCE(SUM(si.unit_cost * ri.quantity), 0)::text AS returned_cogs,
             COALESCE(SUM(r.refund_total), 0)::text AS refunds
      FROM returns r
      JOIN return_items ri ON ri.return_id = r.id
      JOIN sale_items si ON si.id = ri.sale_item_id
      WHERE r.created_at >= ${from} AND r.created_at < ${to}
    `,
    sql<{ expenses: string }[]>`
      SELECT COALESCE(SUM(amount), 0)::text AS expenses
      FROM expenses
      WHERE expense_date >= (${from}::timestamptz AT TIME ZONE 'Africa/Kigali')::date
        AND expense_date < (${to}::timestamptz AT TIME ZONE 'Africa/Kigali')::date
    `,
  ]);

  const netSales = Number(salesAgg[0]?.net_sales ?? 0);
  const cogs = Math.max(0, Number(cogsAgg[0]?.cogs ?? 0) - Number(returnsAgg[0]?.returned_cogs ?? 0));
  const expenses = Number(expensesAgg[0]?.expenses ?? 0);
  const grossProfit = netSales - cogs;

  return ok(c, {
    range: label,
    netSales,
    discounts: Number(salesAgg[0]?.discounts ?? 0),
    refunds: Number(returnsAgg[0]?.refunds ?? 0),
    transactions: Number(salesAgg[0]?.count ?? 0),
    cogs,
    grossProfit,
    grossMargin: netSales > 0 ? (grossProfit / netSales) * 100 : 0,
    operatingExpenses: expenses,
    operatingProfit: grossProfit - expenses,
    note: "Management view: excludes taxes and accounting adjustments. COGS uses the saved moving-average cost snapshot on each sale line.",
  });
});

reportRoutes.get("/expenses", requireAuth, requirePermission("reports.view"), async (c) => {
  const { from, to, label } = resolveRange(c);

  const [total, byCategory] = await Promise.all([
    sql<{ total: string; count: string }[]>`
      SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS count
      FROM expenses
      WHERE expense_date >= (${from}::timestamptz AT TIME ZONE 'Africa/Kigali')::date
        AND expense_date < (${to}::timestamptz AT TIME ZONE 'Africa/Kigali')::date
    `,
    sql<{ category: string; total: string; count: string }[]>`
      SELECT category, COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS count
      FROM expenses
      WHERE expense_date >= (${from}::timestamptz AT TIME ZONE 'Africa/Kigali')::date
        AND expense_date < (${to}::timestamptz AT TIME ZONE 'Africa/Kigali')::date
      GROUP BY category ORDER BY SUM(amount) DESC
    `,
  ]);

  return ok(c, {
    range: label,
    total: Number(total[0]?.total ?? 0),
    count: Number(total[0]?.count ?? 0),
    byCategory: byCategory.map((r) => ({ category: r.category, total: Number(r.total), count: Number(r.count) })),
  });
});

import { Hono } from "hono";
import { sql } from "../db";
import { ok, requireAuth, requirePermission } from "../http";

// Store-local timezone for "today" boundaries (Rwanda has no DST, fixed +02:00).
const KIGALI_OFFSET_MINUTES = 120;

function kigaliStartOfDay(offsetDays = 0): Date {
  const now = new Date();
  const kigali = new Date(now.getTime() + KIGALI_OFFSET_MINUTES * 60_000);
  const startUtc = Date.UTC(kigali.getUTCFullYear(), kigali.getUTCMonth(), kigali.getUTCDate() + offsetDays);
  return new Date(startUtc - KIGALI_OFFSET_MINUTES * 60_000);
}

function kigaliDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "Africa/Kigali" }).format(date);
}

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/", requireAuth, requirePermission("dashboard"), async (c) => {
  const range = new URL(c.req.url).searchParams.get("range") ?? "today";
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 1;
  const start = kigaliStartOfDay(-(days - 1));
  const todayStart = kigaliStartOfDay(0);

  const [salesAgg, stockAgg, trendRows, topRows, recentRows, lowStockRows] = await Promise.all([
    sql<{ sales_total: string; transactions: string }[]>`
      SELECT COALESCE(SUM(total), 0)::text AS sales_total, COUNT(*)::text AS transactions
      FROM sales
      WHERE status = 'completed' AND completed_at >= ${start}
    `,
    sql<{ sellable_units: string; low_stock_count: string; inventory_value: string }[]>`
      SELECT COALESCE(SUM(GREATEST(COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0)
                                  - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0), 0)), 0)::text AS sellable_units,
             COUNT(*) FILTER (WHERE
               COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0)
               - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0) <= v.reorder_level
             )::text AS low_stock_count,
             COALESCE(SUM(COALESCE(b.quantity_on_hand,0) * COALESCE(b.moving_average_cost,0)), 0)::text AS inventory_value
      FROM product_variants v
      LEFT JOIN inventory_balances b ON b.variant_id = v.id
      WHERE v.status = 'active'
    `,
    sql<{ day: string; total: string }[]>`
      WITH days AS (
        SELECT generate_series(${start}::timestamptz, ${todayStart}::timestamptz, interval '1 day') AS day
      )
      SELECT day, COALESCE(SUM(s.total), 0)::text AS total
      FROM days
      LEFT JOIN sales s
        ON s.status = 'completed'
        AND s.completed_at >= days.day
        AND s.completed_at < days.day + interval '1 day'
      GROUP BY day
      ORDER BY day
    `,
    sql<{ product_id: string; name: string; units: string; revenue: string }[]>`
      SELECT si.product_id, MAX(si.product_name) AS name, SUM(si.quantity)::text AS units, COALESCE(SUM(si.line_total), 0)::text AS revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'completed' AND s.completed_at >= ${start} AND si.product_id IS NOT NULL
      GROUP BY si.product_id
      ORDER BY SUM(si.quantity) DESC
      LIMIT 5
    `,
    sql<
      {
        id: string;
        receipt_number: string;
        completed_at: string;
        total: string;
        cashier_name: string | null;
        payment_method: string | null;
      }[]
    >`
      SELECT s.id, s.receipt_number, s.completed_at, s.total::text, u.name AS cashier_name,
             (SELECT p.method FROM payments p WHERE p.sale_id = s.id ORDER BY p.recorded_at LIMIT 1) AS payment_method
      FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
      WHERE s.status = 'completed'
      ORDER BY s.completed_at DESC
      LIMIT 6
    `,
    sql<
      {
        variant_id: string;
        product_name: string;
        size: string;
        colour: string | null;
        sellable: number;
        reorder_level: number;
      }[]
    >`
      SELECT v.id AS variant_id, p.name AS product_name, v.size, v.colour,
             (COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0)
              - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0)) AS sellable,
             v.reorder_level
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN inventory_balances b ON b.variant_id = v.id
      WHERE v.status = 'active'
        AND (COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0)
             - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0)) <= v.reorder_level
      ORDER BY sellable ASC, p.name
      LIMIT 8
    `,
  ]);

  return ok(c, {
    range,
    salesTotal: Number(salesAgg[0]?.sales_total ?? 0),
    transactions: Number(salesAgg[0]?.transactions ?? 0),
    sellableUnits: Number(stockAgg[0]?.sellable_units ?? 0),
    lowStockCount: Number(stockAgg[0]?.low_stock_count ?? 0),
    inventoryValue: Number(stockAgg[0]?.inventory_value ?? 0),
    trend: trendRows.map((r) => ({ date: kigaliDayLabel(new Date(r.day)), total: Number(r.total) })),
    topProducts: topRows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      unitsSold: Number(r.units),
      revenue: Number(r.revenue),
    })),
    recentSales: recentRows.map((r) => ({
      id: r.id,
      receiptNumber: r.receipt_number,
      total: Number(r.total),
      paymentMethod: r.payment_method,
      completedAt: r.completed_at,
      cashierName: r.cashier_name,
    })),
    lowStock: lowStockRows.map((r) => ({
      variantId: r.variant_id,
      productName: r.product_name,
      label: r.colour ? `${r.size} / ${r.colour}` : r.size,
      sellable: r.sellable,
      reorderLevel: r.reorder_level,
    })),
  });
});

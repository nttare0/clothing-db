// Demo mode is 100% client-side: synthetic fixtures from lib/demo-data.ts are
// served from memory by lib/api.ts while the store has no real sales and the
// demo hasn't been dismissed. Nothing demo is ever written to the database.
//
// Persisted state (one settings row, written only when the demo ends):
//   absent            → demo may be shown (fresh store)
//   "removed"         → demo never shows again for this store
// Legacy deployments seeded demo rows into the DB; removeDemoData() purges
// those exact rows (fixed UUIDs / DEMO- markers) and marks the demo removed.

import { sql } from "./db";
import { audit } from "./http";

const STATE_KEY = "demo_seed_state";

async function readRemoved(): Promise<boolean> {
  const rows = await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${STATE_KEY} LIMIT 1`;
  const v = rows[0]?.value;
  const s = typeof v === "string" ? v.replace(/^"|"$/g, "") : null;
  return s === "removed";
}

export async function getDemoState(): Promise<"active" | "none"> {
  if (await readRemoved()) return "none";
  const sales = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM sales`;
  return (sales[0]?.n ?? 0) === 0 ? "active" : "none";
}

const LEGACY_VARIANT_IDS = [
  "de000000-0000-4000-9000-000000000001", "de000000-0000-4000-9000-000000000002", "de000000-0000-4000-9000-000000000003",
  "de000000-0000-4000-9000-000000000004", "de000000-0000-4000-9000-000000000005", "de000000-0000-4000-9000-000000000006",
  "de000000-0000-4000-9000-000000000007", "de000000-0000-4000-9000-000000000008", "de000000-0000-4000-9000-000000000009",
  "de000000-0000-4000-9000-000000000010", "de000000-0000-4000-9000-000000000011", "de000000-0000-4000-9000-000000000012",
  "de000000-0000-4000-9000-000000000013",
] as const;
const LEGACY_PRODUCT_IDS = [
  "de000000-0000-4000-8000-000000000001", "de000000-0000-4000-8000-000000000002", "de000000-0000-4000-8000-000000000003",
  "de000000-0000-4000-8000-000000000004", "de000000-0000-4000-8000-000000000005", "de000000-0000-4000-8000-000000000006",
] as const;
const LEGACY_CATEGORY_IDS = [
  "de000000-0000-4000-7000-000000000001", "de000000-0000-4000-7000-000000000002",
  "de000000-0000-4000-7000-000000000003", "de000000-0000-4000-7000-000000000004",
] as const;

/** Purge legacy DB-seeded demo rows (no-op when none exist) and mark the demo removed. */
export async function removeDemoData(actorId: string | null, requestId?: string): Promise<{ removed: boolean; counts: Record<string, number> }> {
  const counts: Record<string, number> = {};
  await sql.begin(async (tx) => {
    counts.movements = await tx`DELETE FROM stock_movements WHERE source_type = 'demo'`.then((r) => r.count);
    counts.sales = await tx`DELETE FROM sales WHERE receipt_number LIKE 'DEMO-%'`.then((r) => r.count); // cascades sale_items + payments
    counts.expenses = await tx`DELETE FROM expenses WHERE description LIKE 'DEMO-%'`.then((r) => r.count);
    // Keep any legacy demo row a real transaction now points at — never break real history.
    counts.customers = await tx`
      DELETE FROM customers c
      WHERE c.phone = '+250700000001'
        AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.customer_id = c.id)
    `.then((r) => r.count);
    counts.suppliers = await tx`DELETE FROM suppliers WHERE id = 'de000000-0000-4000-6000-000000000001'`.then((r) => r.count);
    counts.variants = await tx`
      DELETE FROM product_variants v
      WHERE v.id = ANY(${[...LEGACY_VARIANT_IDS]})
        AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.variant_id = v.id)
        AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.variant_id = v.id)
    `.then((r) => r.count);
    counts.products = await tx`
      DELETE FROM products p
      WHERE p.id = ANY(${[...LEGACY_PRODUCT_IDS]})
        AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
    `.then((r) => r.count);
    counts.categories = await tx`
      DELETE FROM categories c
      WHERE c.id = ANY(${[...LEGACY_CATEGORY_IDS]})
        AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id)
    `.then((r) => r.count);
    await tx`
      INSERT INTO settings (key, value, updated_at, updated_by)
      VALUES (${STATE_KEY}, '"removed"'::jsonb, now(), ${actorId})
      ON CONFLICT (key) DO UPDATE SET value = '"removed"'::jsonb, updated_at = now(), updated_by = EXCLUDED.updated_by
    `;
  });

  await audit(actorId, "demo.remove", "system", null, { after: counts, requestId });
  return { removed: true, counts };
}

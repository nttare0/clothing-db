// Demo data: a brand-new store signs in and sees a realistic ClothFlow workspace —
// a few products with sizes in stock, two sales, one low-stock variant, one customer,
// one supplier and sample expenses — so the app demos itself before real work begins.
//
// Everything demo is findable by fixed UUIDs / DEMO- markers, and removal is targeted:
// it never touches real rows. The demo disappears automatically the first time someone
// creates a product, receives stock, or completes a sale (see maybeRemoveDemo calls in
// the write routes), or manually via POST /demo/remove.

import { sql } from "./db";
import { audit } from "./http";

const STATE_KEY = "demo_seed_state";

// Fixed UUIDs (hex-only, version/variant bits set) so seeding is idempotent and removal is exact.
const DEMO_CATEGORY_IDS = [
  "de000000-0000-4000-7000-000000000001",
  "de000000-0000-4000-7000-000000000002",
  "de000000-0000-4000-7000-000000000003",
  "de000000-0000-4000-7000-000000000004",
] as const;
const DEMO_PRODUCT_IDS = [
  "de000000-0000-4000-8000-000000000001", // Classic Cotton Tee
  "de000000-0000-4000-8000-000000000002", // Slim Stretch Jeans
  "de000000-0000-4000-8000-000000000003", // Ankara Wrap Dress
  "de000000-0000-4000-8000-000000000004", // Oversized Hoodie
  "de000000-0000-4000-8000-000000000005", // Leather Belt
  "de000000-0000-4000-8000-000000000006", // Canvas Tote
] as const;
// Variant UUIDs, ordered to match the seed rows below.
const DEMO_VARIANT_IDS = [
  "de000000-0000-4000-9000-000000000001", // tee S
  "de000000-0000-4000-9000-000000000002", // tee M
  "de000000-0000-4000-9000-000000000003", // tee L
  "de000000-0000-4000-9000-000000000004", // tee XL
  "de000000-0000-4000-9000-000000000005", // jeans 30
  "de000000-0000-4000-9000-000000000006", // jeans 32
  "de000000-0000-4000-9000-000000000007", // jeans 34
  "de000000-0000-4000-9000-000000000008", // dress M
  "de000000-0000-4000-9000-000000000009", // dress L
  "de000000-0000-4000-9000-000000000010", // hoodie M
  "de000000-0000-4000-9000-000000000011", // hoodie L
  "de000000-0000-4000-9000-000000000012", // belt one-size
  "de000000-0000-4000-9000-000000000013", // tote one
] as const;
const DEMO_SUPPLIER_ID = "de000000-0000-4000-6000-000000000001";
const DEMO_CUSTOMER_ID = "de000000-0000-4000-5000-000000000001";
const DEMO_CUSTOMER_PHONE = "+250700000001";
const DEMO_SALE_IDS = [
  "de000000-0000-4000-3000-000000000001",
  "de000000-0000-4000-3000-000000000002",
] as const;

export type DemoState = "active" | "none";

async function readState(): Promise<"active" | "removed" | null> {
  const rows = await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${STATE_KEY} LIMIT 1`;
  const v = rows[0]?.value;
  if (typeof v === "string") return (v as "active" | "removed") ?? null;
  if (v === "active" || v === "removed") return v;
  return null;
}

export async function getDemoState(): Promise<DemoState> {
  return (await readState()) === "active" ? "active" : "none";
}

/**
 * Seed the demo workspace. No-op once demo has been seeded or removed, or once the
 * store has any real sales (a store that is already selling does not need a demo).
 * An advisory transaction lock keeps concurrent first sign-ins from double-seeding.
 */
export async function ensureDemoSeed(actorId: string): Promise<"seeded" | "skipped"> {
  const state = await readState();
  if (state === "active" || state === "removed") return "skipped";

  let seeded = false;
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('clothflow-demo-seed'))`;

    const stateRows = await tx<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${STATE_KEY} LIMIT 1`;
    const current = stateRows[0]?.value;
    if (current === "active" || current === '"active"' || current === "removed" || current === '"removed"') return;

    const salesRows = await tx<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM sales WHERE receipt_number NOT LIKE 'DEMO-%'`;
    if ((salesRows[0]?.n ?? 0) > 0) return;

    // Categories
    const categories = [
      [DEMO_CATEGORY_IDS[0], "T-Shirts", "Demo: everyday tees"],
      [DEMO_CATEGORY_IDS[1], "Denim", "Demo: jeans"],
      [DEMO_CATEGORY_IDS[2], "Dresses", "Demo: dresses"],
      [DEMO_CATEGORY_IDS[3], "Accessories", "Demo: belts and bags"],
    ] as const;
    for (const [id, name, description] of categories) {
      await tx`INSERT INTO categories (id, name, description) VALUES (${id}, ${name}, ${description}) ON CONFLICT (id) DO NOTHING`;
    }

    // Products
    const products = [
      [DEMO_PRODUCT_IDS[0], DEMO_CATEGORY_IDS[0], "Classic Cotton Tee", "Denver", "Demo: 100% cotton essential tee"],
      [DEMO_PRODUCT_IDS[1], DEMO_CATEGORY_IDS[1], "Slim Stretch Jeans", "Denver", "Demo: slim fit, stretch denim"],
      [DEMO_PRODUCT_IDS[2], DEMO_CATEGORY_IDS[2], "Ankara Wrap Dress", null, "Demo: printed wrap dress"],
      [DEMO_PRODUCT_IDS[3], DEMO_CATEGORY_IDS[0], "Oversized Hoodie", "Northline", "Demo: heavyweight fleece"],
      [DEMO_PRODUCT_IDS[4], DEMO_CATEGORY_IDS[3], "Leather Belt", null, "Demo: genuine leather"],
      [DEMO_PRODUCT_IDS[5], DEMO_CATEGORY_IDS[3], "Canvas Tote", null, "Demo: everyday canvas bag"],
    ] as const;
    for (const [id, categoryId, name, brand, description] of products) {
      await tx`INSERT INTO products (id, category_id, name, brand, description, created_by)
               VALUES (${id}, ${categoryId}, ${name}, ${brand}, ${description}, ${actorId})
               ON CONFLICT (id) DO NOTHING`;
    }

    // Variants: [id, productId, size, colour, sku, price, reorderLevel]
    const variants = [
      [DEMO_VARIANT_IDS[0], DEMO_PRODUCT_IDS[0], "S", "Black", "DEMO-TEE-BLK-S", 8500, 5],
      [DEMO_VARIANT_IDS[1], DEMO_PRODUCT_IDS[0], "M", "Black", "DEMO-TEE-BLK-M", 8500, 5],
      [DEMO_VARIANT_IDS[2], DEMO_PRODUCT_IDS[0], "L", "Black", "DEMO-TEE-BLK-L", 8500, 5],
      [DEMO_VARIANT_IDS[3], DEMO_PRODUCT_IDS[0], "XL", "Black", "DEMO-TEE-BLK-XL", 8500, 5],
      [DEMO_VARIANT_IDS[4], DEMO_PRODUCT_IDS[1], "30", "Blue", "DEMO-JEN-BLU-30", 25000, 5],
      [DEMO_VARIANT_IDS[5], DEMO_PRODUCT_IDS[1], "32", "Blue", "DEMO-JEN-BLU-32", 25000, 5],
      [DEMO_VARIANT_IDS[6], DEMO_PRODUCT_IDS[1], "34", "Blue", "DEMO-JEN-BLU-34", 25000, 5],
      [DEMO_VARIANT_IDS[7], DEMO_PRODUCT_IDS[2], "M", "Multi", "DEMO-DRS-MUL-M", 35000, 5],
      [DEMO_VARIANT_IDS[8], DEMO_PRODUCT_IDS[2], "L", "Multi", "DEMO-DRS-MUL-L", 35000, 5],
      [DEMO_VARIANT_IDS[9], DEMO_PRODUCT_IDS[3], "M", "Grey", "DEMO-HOD-GRY-M", 28000, 5],
      [DEMO_VARIANT_IDS[10], DEMO_PRODUCT_IDS[3], "L", "Grey", "DEMO-HOD-GRY-L", 28000, 5],
      [DEMO_VARIANT_IDS[11], DEMO_PRODUCT_IDS[4], "One size", "Brown", "DEMO-BLT-BRN-OS", 12000, 5],
      [DEMO_VARIANT_IDS[12], DEMO_PRODUCT_IDS[5], "One size", "Natural", "DEMO-TOT-NTL-OS", 9500, 5],
    ] as const;
    for (const [id, productId, size, colour, sku, price, reorder] of variants) {
      await tx`INSERT INTO product_variants (id, product_id, size, colour, sku, selling_price, reorder_level)
               VALUES (${id}, ${productId}, ${size}, ${colour}, ${sku}, ${price}, ${reorder})
               ON CONFLICT (id) DO NOTHING`;
    }

    // Opening balances + ledger (before_on_hand 0, after = opening)
    const opening = [40, 35, 30, 25, 18, 22, 15, 12, 9, 20, 14, 6, 18];
    const costs = [3200, 3200, 3200, 3200, 11000, 11000, 11000, 15000, 15000, 12500, 12500, 5000, 4000];
    for (let i = 0; i < DEMO_VARIANT_IDS.length; i++) {
      const variantId = DEMO_VARIANT_IDS[i]!;
      const qty = opening[i]!;
      await tx`INSERT INTO inventory_balances (variant_id, quantity_on_hand, moving_average_cost)
               VALUES (${variantId}, ${qty}, ${costs[i]})
               ON CONFLICT (variant_id) DO NOTHING`;
      await tx`INSERT INTO stock_movements (variant_id, actor_id, movement_type, on_hand_delta, before_on_hand, after_on_hand, source_type, reason, reference, created_at)
               VALUES (${variantId}, ${actorId}, 'OPENING_BALANCE', ${qty}, 0, ${qty}, 'demo', 'demo_seed', 'demo', now() - interval '20 days')`;
    }

    // Supplier / customer
    await tx`INSERT INTO suppliers (id, name, contact_person, phone, email, address, notes, status)
             VALUES (${DEMO_SUPPLIER_ID}, 'Demo Textile Supplier — Kigali', 'Jean-Bosco M.', '+250788000099', 'orders@demo-textile.rw', 'Kimironko, Kigali', 'Demo supplier — removed when you start working.', 'active')
             ON CONFLICT (id) DO NOTHING`;
    await tx`INSERT INTO customers (id, name, phone, notes, status)
             VALUES (${DEMO_CUSTOMER_ID}, 'Demo Customer', ${DEMO_CUSTOMER_PHONE}, 'Demo customer — removed when you start working.', 'active')
             ON CONFLICT (id) DO NOTHING`;

    // Sale 1 — today: 2× tee M + 1× belt, cash 29,000
    const teeM = DEMO_VARIANT_IDS[1]!;
    const belt = DEMO_VARIANT_IDS[11]!;
    await tx`INSERT INTO sales (id, receipt_number, cashier_id, customer_id, customer_phone, status, return_status, subtotal, discount_total, total, change_due, idempotency_key, completed_at, created_at)
             VALUES (${DEMO_SALE_IDS[0]}, 'DEMO-1001', ${actorId}, ${DEMO_CUSTOMER_ID}, ${DEMO_CUSTOMER_PHONE}, 'completed', 'none', 29000, 0, 29000, 0, 'demo-seed-1001', now() - interval '3 hours', now() - interval '3 hours')
             ON CONFLICT (id) DO NOTHING`;
    await tx`INSERT INTO sale_items (sale_id, variant_id, product_id, product_name, variant_label, sku, quantity, unit_price, unit_cost, discount_amount, line_total)
             VALUES (${DEMO_SALE_IDS[0]}, ${teeM}, ${DEMO_PRODUCT_IDS[0]}, 'Classic Cotton Tee', 'M / Black', 'DEMO-TEE-BLK-M', 2, 8500, 3200, 0, 17000)`;
    await tx`INSERT INTO sale_items (sale_id, variant_id, product_id, product_name, variant_label, sku, quantity, unit_price, unit_cost, discount_amount, line_total)
             VALUES (${DEMO_SALE_IDS[0]}, ${belt}, ${DEMO_PRODUCT_IDS[4]}, 'Leather Belt', 'One size / Brown', 'DEMO-BLT-BRN-OS', 1, 12000, 5000, 0, 12000)`;
    await tx`INSERT INTO payments (sale_id, method, amount, status, recorded_at)
             VALUES (${DEMO_SALE_IDS[0]}, 'cash', 29000, 'recorded', now() - interval '3 hours')`;
    await tx`UPDATE inventory_balances SET quantity_on_hand = quantity_on_hand - 2, updated_at = now() WHERE variant_id = ${teeM}`;
    await tx`UPDATE inventory_balances SET quantity_on_hand = quantity_on_hand - 1, updated_at = now() WHERE variant_id = ${belt}`;
    await tx`INSERT INTO stock_movements (variant_id, actor_id, movement_type, on_hand_delta, before_on_hand, after_on_hand, source_type, source_id, reason, reference, created_at)
             VALUES (${teeM}, ${actorId}, 'SALE', -2, 35, 33, 'demo', ${DEMO_SALE_IDS[0]}, 'demo_seed', 'DEMO-1001', now() - interval '3 hours')`;
    await tx`INSERT INTO stock_movements (variant_id, actor_id, movement_type, on_hand_delta, before_on_hand, after_on_hand, source_type, source_id, reason, reference, created_at)
             VALUES (${belt}, ${actorId}, 'SALE', -1, 6, 5, 'demo', ${DEMO_SALE_IDS[0]}, 'demo_seed', 'DEMO-1001', now() - interval '3 hours')`;

    // Sale 2 — yesterday: 1× jeans 32, mobile money 22,500 after 2,500 discount
    const jeans32 = DEMO_VARIANT_IDS[5]!;
    await tx`INSERT INTO sales (id, receipt_number, cashier_id, customer_id, customer_phone, status, return_status, subtotal, discount_total, total, change_due, idempotency_key, completed_at, created_at)
             VALUES (${DEMO_SALE_IDS[1]}, 'DEMO-1002', ${actorId}, ${DEMO_CUSTOMER_ID}, ${DEMO_CUSTOMER_PHONE}, 'completed', 'none', 25000, 2500, 22500, 0, 'demo-seed-1002', now() - interval '1 day', now() - interval '1 day')
             ON CONFLICT (id) DO NOTHING`;
    await tx`INSERT INTO sale_items (sale_id, variant_id, product_id, product_name, variant_label, sku, quantity, unit_price, unit_cost, discount_amount, line_total)
             VALUES (${DEMO_SALE_IDS[1]}, ${jeans32}, ${DEMO_PRODUCT_IDS[1]}, 'Slim Stretch Jeans', '32 / Blue', 'DEMO-JEN-BLU-32', 1, 25000, 11000, 2500, 22500)`;
    await tx`INSERT INTO payments (sale_id, method, amount, reference, status, recorded_at)
             VALUES (${DEMO_SALE_IDS[1]}, 'mobile_money', 22500, 'MP-DEMO-001', 'recorded', now() - interval '1 day')`;
    await tx`UPDATE inventory_balances SET quantity_on_hand = quantity_on_hand - 1, updated_at = now() WHERE variant_id = ${jeans32}`;
    await tx`INSERT INTO stock_movements (variant_id, actor_id, movement_type, on_hand_delta, before_on_hand, after_on_hand, source_type, source_id, reason, reference, created_at)
             VALUES (${jeans32}, ${actorId}, 'SALE', -1, 22, 21, 'demo', ${DEMO_SALE_IDS[1]}, 'demo_seed', 'DEMO-1002', now() - interval '1 day')`;

    // Expenses
    await tx`INSERT INTO expenses (expense_date, category, amount, payment_method, payee, description, entered_by, created_at, updated_at)
             VALUES (CURRENT_DATE - 5, 'Rent', 150000, 'bank_transfer', 'Demo Property Ltd', 'DEMO- Shop rent (demo — removed when you start)', ${actorId}, now() - interval '5 days', now() - interval '5 days')`;
    await tx`INSERT INTO expenses (expense_date, category, amount, payment_method, payee, description, entered_by, created_at, updated_at)
             VALUES (CURRENT_DATE - 2, 'Transport', 18500, 'cash', 'Moto & delivery', 'DEMO- Transport and delivery (demo — removed when you start)', ${actorId}, now() - interval '2 days', now() - interval '2 days')`;
    await tx`
      INSERT INTO settings (key, value, updated_at, updated_by)
      VALUES (${STATE_KEY}, '"active"'::jsonb, now(), ${actorId})
      ON CONFLICT (key) DO UPDATE SET value = '"active"'::jsonb, updated_at = now(), updated_by = EXCLUDED.updated_by
    `;
    seeded = true;
  });

  return seeded ? "seeded" : "skipped";
}

/** Delete every demo row (targeted — never touches real data) and mark demo as handled. */
export async function removeDemoData(actorId: string | null, requestId?: string): Promise<{ removed: boolean; counts: Record<string, number> }> {
  const state = await readState();
  if (state !== "active") return { removed: false, counts: {} };

  const counts: Record<string, number> = {};
  await sql.begin(async (tx) => {
    counts.movements = await tx`DELETE FROM stock_movements WHERE source_type = 'demo'`.then((r) => r.count);
    counts.sales = await tx`DELETE FROM sales WHERE receipt_number LIKE 'DEMO-%'`.then((r) => r.count); // cascades sale_items + payments
    counts.expenses = await tx`DELETE FROM expenses WHERE description LIKE 'DEMO-%'`.then((r) => r.count);
    // Keep any demo row a real transaction now points at — removing it would break real history.
    counts.customers = await tx`
      DELETE FROM customers c
      WHERE c.phone = ${DEMO_CUSTOMER_PHONE}
        AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.customer_id = c.id)
    `.then((r) => r.count);
    counts.suppliers = await tx`DELETE FROM suppliers WHERE id = ${DEMO_SUPPLIER_ID}`.then((r) => r.count); // purchases.supplier_id SET NULLs
    counts.variants = await tx`
      DELETE FROM product_variants v
      WHERE v.id = ANY(${[...DEMO_VARIANT_IDS]})
        AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.variant_id = v.id)
        AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.variant_id = v.id)
    `.then((r) => r.count); // cascades inventory_balances
    counts.products = await tx`
      DELETE FROM products p
      WHERE p.id = ANY(${[...DEMO_PRODUCT_IDS]})
        AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
    `.then((r) => r.count);
    counts.categories = await tx`
      DELETE FROM categories c
      WHERE c.id = ANY(${[...DEMO_CATEGORY_IDS]})
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

/**
 * Called after a real "I started working" write (product created, stock received,
 * sale completed…). Removes the demo dataset once, silently, best-effort.
 */
export async function maybeRemoveDemo(actorId: string, requestId?: string): Promise<void> {
  try {
    if ((await readState()) === "active") {
      await removeDemoData(actorId, requestId);
    }
  } catch (err) {
    // Never block a real sale/stock action on demo cleanup — log and move on.
    console.error("demo_auto_remove_failed", err);
  }
}

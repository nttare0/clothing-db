import { Hono } from "hono";
import { sql } from "../db";
import { fail, ok, requireAuth, requirePermission } from "../http";

// ---------- POS search ----------
export const posRoutes = new Hono();

posRoutes.get("/search", requireAuth, requirePermission("pos.sale"), async (c) => {
  const q = (new URL(c.req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return ok(c, { items: [] });
  const like = `%${q.toLowerCase()}%`;

  const rows = await sql<
    {
      variant_id: string;
      product_name: string;
      size: string;
      colour: string | null;
      sku: string;
      barcode: string | null;
      selling_price: string | null;
      sellable: number;
    }[]
  >`
    SELECT v.id AS variant_id, p.name AS product_name, v.size, v.colour, v.sku, v.barcode,
           v.selling_price::text,
           COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0)
             - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0) AS sellable
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN inventory_balances b ON b.variant_id = v.id
    WHERE p.status = 'active' AND v.status = 'active'
      AND (lower(p.name) LIKE ${like} OR lower(v.sku) LIKE ${like} OR lower(COALESCE(v.barcode, '')) LIKE ${like})
    ORDER BY (COALESCE(v.barcode, '') = ${q.toLowerCase()}) DESC, sellable DESC, lower(p.name)
    LIMIT 20
  `;

  return ok(c, {
    items: rows.map((r) => ({
      variantId: r.variant_id,
      productName: r.product_name,
      label: r.colour ? `${r.size} / ${r.colour}` : r.size,
      sku: r.sku,
      price: r.selling_price === null ? null : Number(r.selling_price),
      sellable: Math.max(0, r.sellable),
    })),
  });
});

// Browsable catalogue for the POS screen: every active variant, no typing needed.
posRoutes.get("/catalog", requireAuth, requirePermission("pos.sale"), async (c) => {
  const url = new URL(c.req.url);
  const params = url.searchParams;
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const categoryId = (params.get("categoryId") ?? "").trim();
  if (categoryId && !/^[0-9a-f-]{36}$/i.test(categoryId)) {
    return fail(c, 400, "VALIDATION", "We couldn't tell which category that is. Pick it again and retry.");
  }
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.min(96, Math.max(1, Number(params.get("pageSize") ?? "48") || 48));
  const offset = (page - 1) * pageSize;
  const like = `%${q}%`;

  const where = sql`
    p.status = 'active' AND v.status = 'active'
    AND (${categoryId === "" ? null : categoryId}::uuid IS NULL OR p.category_id = ${categoryId === "" ? null : categoryId}::uuid)
    AND (
      ${q === "" ? null : like}::text IS NULL
      OR lower(p.name) LIKE ${like}
      OR lower(v.sku) LIKE ${like}
      OR lower(COALESCE(v.barcode, '')) LIKE ${like}
      OR lower(COALESCE(p.brand, '')) LIKE ${like}
    )
  `;

  const countRows = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    WHERE ${where}
  `;
  const rows = await sql<
    {
      variant_id: string;
      product_name: string;
      brand: string | null;
      category_id: string | null;
      category: string | null;
      size: string;
      colour: string | null;
      sku: string;
      barcode: string | null;
      selling_price: string | null;
      sellable: number;
    }[]
  >`
    SELECT v.id AS variant_id, p.name AS product_name, p.brand, cat.id AS category_id, cat.name AS category,
           v.size, v.colour, v.sku, v.barcode, v.selling_price::text,
           COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0)
             - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0) AS sellable
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN inventory_balances b ON b.variant_id = v.id
    WHERE ${where}
    ORDER BY lower(p.name), lower(v.size), lower(COALESCE(v.colour, ''))
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  return ok(c, {
    total: Number(countRows[0]?.n ?? 0),
    page,
    pageSize,
    items: rows.map((r) => ({
      variantId: r.variant_id,
      productName: r.product_name,
      label: r.colour ? `${r.size} / ${r.colour}` : r.size,
      sku: r.sku,
      price: r.selling_price === null ? null : Number(r.selling_price),
      sellable: Math.max(0, r.sellable),
      brand: r.brand,
      categoryId: r.category_id,
      category: r.category,
    })),
  });
});

// Variant lookup for the stock-in prefill flow (?variantId=...)
export const variantsRoutes = new Hono();

variantsRoutes.get("/lookup", requireAuth, requirePermission("stock.receive"), async (c) => {
  const variantId = new URL(c.req.url).searchParams.get("variantId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(variantId)) return ok(c, []);
  const rows = await sql<
    {
      variant_id: string;
      product_name: string;
      size: string;
      colour: string | null;
      sku: string;
      sellable: number;
    }[]
  >`
    SELECT v.id AS variant_id, p.name AS product_name, v.size, v.colour, v.sku,
           COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0)
             - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0) AS sellable
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN inventory_balances b ON b.variant_id = v.id
    WHERE v.id = ${variantId}
    LIMIT 1
  `;
  return ok(
    c,
    rows.map((r) => ({
      variantId: r.variant_id,
      productName: r.product_name,
      label: r.colour ? `${r.size} / ${r.colour}` : r.size,
      sku: r.sku,
      sellable: Math.max(0, r.sellable),
    })),
  );
});

// ---------- Stock movements ledger ----------
export const movementRoutes = new Hono();

movementRoutes.get("/", requireAuth, requirePermission("movements.view"), async (c) => {
  const params = new URL(c.req.url).searchParams;
  const productId = params.get("productId") ?? "";
  const reference = (params.get("reference") ?? "").trim();
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const typeRaw = params.get("type") ?? "all";
  const parsed = typeRaw === "all" ? [] : typeRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 9);
  const typeList = parsed.length > 0 ? parsed : null;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const limitParam = params.get("limit"); // convenience for embedded widgets (e.g. product detail)
  const pageSize = limitParam
    ? Math.min(100, Math.max(1, Number(limitParam) || 30))
    : Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "30") || 30));
  const offset = (page - 1) * pageSize;
  const like = `%${search}%`;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference);

  const rows = await sql<
    {
      id: string;
      created_at: string;
      movement_type: string;
      product_name: string;
      product_id: string;
      size: string;
      colour: string | null;
      sku: string;
      on_hand_delta: number;
      reason: string | null;
      reference: string | null;
      actor: string | null;
    }[]
  >`
    SELECT m.id, m.created_at, m.movement_type, p.name AS product_name, p.id AS product_id,
           v.size, v.colour, v.sku, m.on_hand_delta, m.reason, m.reference, u.name AS actor
    FROM stock_movements m
    JOIN product_variants v ON v.id = m.variant_id
    JOIN products p ON p.id = v.product_id
    LEFT JOIN users u ON u.id = m.actor_id
    WHERE
      (${productId || null}::uuid IS NULL OR p.id = ${productId || null}::uuid)
      AND (${typeList === null} OR m.movement_type = ANY(${typeList ?? []}))
      AND (
        ${reference === "" ? null : reference}::text IS NULL
        OR lower(COALESCE(m.reference, '')) LIKE ${`%${reference.toLowerCase()}%`}
        OR (${isUuid} AND m.source_id = ${isUuid ? reference : null}::uuid)
      )
      AND (
        ${search === "" ? null : like}::text IS NULL
        OR lower(p.name) LIKE ${like}
        OR lower(v.sku) LIKE ${like}
        OR lower(COALESCE(m.reference, '')) LIKE ${like}
      )
    ORDER BY m.created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const countRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM stock_movements m
    JOIN product_variants v ON v.id = m.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE
      (${productId || null}::uuid IS NULL OR p.id = ${productId || null}::uuid)
      AND (${typeList === null} OR m.movement_type = ANY(${typeList ?? []}))
      AND (
        ${reference === "" ? null : reference}::text IS NULL
        OR lower(COALESCE(m.reference, '')) LIKE ${`%${reference.toLowerCase()}%`}
        OR (${isUuid} AND m.source_id = ${isUuid ? reference : null}::uuid)
      )
      AND (
        ${search === "" ? null : like}::text IS NULL
        OR lower(p.name) LIKE ${like}
        OR lower(v.sku) LIKE ${like}
        OR lower(COALESCE(m.reference, '')) LIKE ${like}
      )
  `;

  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      type: r.movement_type,
      productName: r.product_name,
      productId: r.product_id,
      label: r.colour ? `${r.size} / ${r.colour}` : r.size,
      sku: r.sku,
      onHandDelta: r.on_hand_delta,
      reason: r.reason,
      reference: r.reference,
      actor: r.actor,
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  });
});

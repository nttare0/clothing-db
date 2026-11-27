import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db";
import { audit, fail, ok, requireAuth, requirePermission } from "../http";
import { zValidator } from "@hono/zod-validator";
import { hook } from "../validate";

// ---------- Categories ----------
export const categoryRoutes = new Hono();

categoryRoutes.get("/", requireAuth, async (c) => {
  const rows = await sql<
    { id: string; name: string; description: string | null; active: boolean; product_count: string }[]
  >`
    SELECT c.id, c.name, c.description, c.active, COUNT(p.id)::text AS product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id
    ORDER BY c.active DESC, lower(c.name)
  `;
  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      active: r.active,
      productCount: Number(r.product_count),
    })),
  });
});

const categoryBody = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(80),
  description: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().optional(),
});

categoryRoutes.post(
  "/",
  requireAuth,
  requirePermission("categories.manage"),
  zValidator("json", categoryBody, hook),
  async (c) => {
    const body = c.req.valid("json") as z.infer<typeof categoryBody>;
    const name = body.name.trim();
    try {
      const rows = await sql<{ id: string; name: string; description: string | null; active: boolean }[]>`
        INSERT INTO categories (name, description)
        VALUES (${name}, ${body.description?.trim() || null})
        RETURNING id, name, description, active
      `;
      const row = rows[0]!;
      await audit(c.get("user").id, "category.create", "category", row.id, {
        after: { name: row.name },
        requestId: c.get("requestId"),
      });
      return ok(c, row, 201);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) return fail(c, 409, "DUPLICATE_CATEGORY", "A category with this name already exists.");
      throw err;
    }
  },
);

categoryRoutes.patch(
  "/:id",
  requireAuth,
  requirePermission("categories.manage"),
  zValidator("json", categoryBody.partial(), hook),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json") as Partial<z.infer<typeof categoryBody>>;
    const before = await sql`SELECT id, name, description, active FROM categories WHERE id = ${id} LIMIT 1`;
    if (before.length === 0) return fail(c, 404, "NOT_FOUND", "Category not found.");
    const cur = before[0] as { id: string; name: string; description: string | null; active: boolean };
    const name = body.name !== undefined ? body.name.trim() : cur.name;
    const description = body.description !== undefined ? body.description?.trim() || null : cur.description;
    const active = body.active !== undefined ? body.active : cur.active;
    try {
      await sql`UPDATE categories SET name = ${name}, description = ${description}, active = ${active} WHERE id = ${id}`;
    } catch (err) {
      if (isUniqueViolation(err)) return fail(c, 409, "DUPLICATE_CATEGORY", "A category with this name already exists.");
      throw err;
    }
    await audit(c.get("user").id, "category.update", "category", id, {
      before: cur,
      after: { name, description, active },
      requestId: c.get("requestId"),
    });
    return ok(c, { id, name, description, active });
  },
);

categoryRoutes.post("/:id/archive", requireAuth, requirePermission("categories.manage"), async (c) => {
  const id = c.req.param("id");
  const result = await sql`UPDATE categories SET active = false WHERE id = ${id} RETURNING id`;
  if (result.length === 0) return fail(c, 404, "NOT_FOUND", "Category not found.");
  await audit(c.get("user").id, "category.archive", "category", id, { requestId: c.get("requestId") });
  return ok(c, { ok: true });
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ---------- Products ----------
export const productRoutes = new Hono();

const variantInput = z.object({
  id: z.string().uuid().optional(),
  size: z.string().trim().min(1, "Size is required.").max(20),
  colour: z.string().trim().max(60).nullable().optional(),
  sku: z.string().trim().min(1, "SKU is required.").max(60),
  barcode: z.string().trim().max(60).nullable().optional(),
  sellingPrice: z.number().finite().min(0, "Price cannot be negative.").nullable().optional(),
  reorderLevel: z.number().int().min(0).max(1_000_000).default(0),
});

const productBody = z.object({
  name: z.string().trim().min(1, "Product name is required.").max(160),
  categoryId: z.string().uuid().nullable().optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  variants: z.array(variantInput).min(1, "Add at least one variant.").max(100),
});

type ProductDetailRow = {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  status: string;
  created_at: string;
  category: string | null;
};

async function fetchProductDetail(id: string) {
  const products = await sql<ProductDetailRow[]>`
    SELECT p.id, p.name, p.brand, p.description, p.status, p.created_at, cat.name AS category
    FROM products p
    LEFT JOIN categories cat ON cat.id = p.category_id
    WHERE p.id = ${id}
    LIMIT 1
  `;
  const product = products[0];
  if (!product) return null;

  const variants = await sql<
    {
      id: string;
      size: string;
      colour: string | null;
      sku: string;
      barcode: string | null;
      selling_price: string | null;
      reorder_level: number;
      status: string;
      quantity_on_hand: number;
      quantity_damaged: number;
      quantity_reserved: number;
      quantity_quarantined: number;
      moving_average_cost: string;
    }[]
  >`
    SELECT v.id, v.size, v.colour, v.sku, v.barcode, v.selling_price::text, v.reorder_level, v.status,
           COALESCE(b.quantity_on_hand, 0) AS quantity_on_hand,
           COALESCE(b.quantity_damaged, 0) AS quantity_damaged,
           COALESCE(b.quantity_reserved, 0) AS quantity_reserved,
           COALESCE(b.quantity_quarantined, 0) AS quantity_quarantined,
           COALESCE(b.moving_average_cost, 0)::text AS moving_average_cost
    FROM product_variants v
    LEFT JOIN inventory_balances b ON b.variant_id = v.id
    WHERE v.product_id = ${id}
    ORDER BY lower(v.size), lower(COALESCE(v.colour, ''))
  `;

  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    description: product.description,
    category: product.category,
    status: product.status,
    createdAt: product.created_at,
    variants: variants.map((v) => {
      const sellable = v.quantity_on_hand - v.quantity_reserved - v.quantity_damaged - v.quantity_quarantined;
      return {
        id: v.id,
        sku: v.sku,
        barcode: v.barcode,
        size: v.size,
        colour: v.colour,
        sellingPrice: v.selling_price === null ? null : Number(v.selling_price),
        movingAverageCost: Number(v.moving_average_cost),
        onHand: v.quantity_on_hand,
        sellable,
        damaged: v.quantity_damaged,
        reorderLevel: v.reorder_level,
      };
    }),
  };
}

productRoutes.get("/", requireAuth, async (c) => {
  const params = new URL(c.req.url).searchParams;
  const search = (params.get("search") ?? "").trim();
  const rawCategoryId = params.get("categoryId") ?? params.get("category") ?? "";
  if (rawCategoryId && !isUuid(rawCategoryId)) return fail(c, 400, "VALIDATION", "We couldn't tell which category that is. Pick it again and retry.");
  const categoryId = rawCategoryId;
  const status = params.get("status") ?? "active"; // active | deactivated | all
  const lowStock = params.get("lowStock") === "1";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "20") || 20));
  const offset = (page - 1) * pageSize;

  const like = `%${search.toLowerCase()}%`;
  const statusFilter = status === "all" ? null : status;

  const rows = await sql<
    {
      id: string;
      name: string;
      brand: string | null;
      category: string | null;
      status: string;
      variant_count: string;
      total_sellable: string;
      min_price: string | null;
      low_stock: boolean;
    }[]
  >`
    SELECT p.id, p.name, p.brand, cat.name AS category, p.status,
           COUNT(v.id)::text AS variant_count,
           COALESCE(SUM(GREATEST(COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0)
                               - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0), 0)), 0)::text AS total_sellable,
           MIN(v.selling_price)::text AS min_price,
           BOOL_OR(
             COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0)
             - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0) <= v.reorder_level
           ) AS low_stock
    FROM products p
    LEFT JOIN categories cat ON cat.id = p.category_id
    JOIN product_variants v ON v.product_id = p.id
    LEFT JOIN inventory_balances b ON b.variant_id = v.id
    WHERE
      (${statusFilter}::text IS NULL OR p.status = ${statusFilter}::text)
      AND (${categoryId || null}::uuid IS NULL OR p.category_id = ${categoryId || null}::uuid)
      AND (
        ${search === "" ? null : like}::text IS NULL
        OR lower(p.name) LIKE ${like}
        OR lower(COALESCE(p.brand, '')) LIKE ${like}
        OR EXISTS (
          SELECT 1 FROM product_variants sv
          WHERE sv.product_id = p.id
            AND (lower(sv.sku) LIKE ${like} OR lower(COALESCE(sv.barcode, '')) LIKE ${like})
        )
      )
    GROUP BY p.id, cat.name
    HAVING ${lowStock ? sql`BOOL_OR(COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0) - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0) <= v.reorder_level)` : sql`TRUE`}
    ORDER BY lower(p.name)
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const countRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM (
      SELECT p.id
      FROM products p
      JOIN product_variants v ON v.product_id = p.id
      LEFT JOIN inventory_balances b ON b.variant_id = v.id
      WHERE
        (${statusFilter}::text IS NULL OR p.status = ${statusFilter}::text)
        AND (${categoryId || null}::uuid IS NULL OR p.category_id = ${categoryId || null}::uuid)
        AND (
          ${search === "" ? null : like}::text IS NULL
          OR lower(p.name) LIKE ${like}
          OR lower(COALESCE(p.brand, '')) LIKE ${like}
          OR EXISTS (
            SELECT 1 FROM product_variants sv
            WHERE sv.product_id = p.id
              AND (lower(sv.sku) LIKE ${like} OR lower(COALESCE(sv.barcode, '')) LIKE ${like})
          )
        )
      GROUP BY p.id
      HAVING ${lowStock ? sql`BOOL_OR(COALESCE(b.quantity_on_hand,0) - COALESCE(b.quantity_reserved,0) - COALESCE(b.quantity_damaged,0) - COALESCE(b.quantity_quarantined,0) <= v.reorder_level)` : sql`TRUE`}
    ) q
  `;

  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      category: r.category,
      status: r.status,
      variantCount: Number(r.variant_count),
      totalSellable: Number(r.total_sellable),
      minPrice: r.min_price === null ? null : Number(r.min_price),
      lowStock: r.low_stock,
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  });
});

productRoutes.post(
  "/",
  requireAuth,
  requirePermission("products.manage"),
  zValidator("json", productBody, hook),
  async (c) => {
    const body = c.req.valid("json") as z.infer<typeof productBody>;
    const user = c.get("user");

    const skus = body.variants.map((v) => v.sku.trim().toUpperCase());
    if (new Set(skus).size !== skus.length) {
      return fail(c, 400, "DUPLICATE_VARIANT", "Each variant needs its own unique SKU.");
    }

    try {
      const created = await sql.begin(async (tx) => {
        const productRows = await tx<{ id: string }[]>`
          INSERT INTO products (category_id, name, brand, description, created_by)
          VALUES (${body.categoryId ?? null}, ${body.name.trim()}, ${body.brand?.trim() || null},
                  ${body.description?.trim() || null}, ${user.id})
          RETURNING id
        `;
        const productId = productRows[0]!.id;

        for (const v of body.variants) {
          const variantRows = await tx<{ id: string }[]>`
            INSERT INTO product_variants (product_id, size, colour, sku, barcode, selling_price, reorder_level)
            VALUES (${productId}, ${v.size.trim()}, ${v.colour?.trim() || null},
                    ${v.sku.trim().toUpperCase()}, ${v.barcode?.trim().toLowerCase() || null},
                    ${v.sellingPrice ?? null}, ${v.reorderLevel ?? 0})
            RETURNING id
          `;
          await tx`INSERT INTO inventory_balances (variant_id) VALUES (${variantRows[0]!.id})`;
        }
        return productId;
      });

      await audit(user.id, "product.create", "product", created, {
        after: { name: body.name.trim(), variantCount: body.variants.length },
        requestId: c.get("requestId"),
      });
      return ok(c, { id: created }, 201);
    } catch (err: unknown) {
      const mapped = mapConstraintError(err);
      if (mapped) return fail(c, mapped.status, mapped.code, mapped.message);
      throw err;
    }
  },
);

productRoutes.get("/:id", requireAuth, async (c) => {
  const detail = await fetchProductDetail(c.req.param("id"));
  if (!detail) return fail(c, 404, "NOT_FOUND", "Product not found.");
  return ok(c, detail);
});

productRoutes.patch(
  "/:id",
  requireAuth,
  requirePermission("products.manage"),
  zValidator("json", productBody.partial(), hook),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json") as Partial<z.infer<typeof productBody>>;
    const user = c.get("user");

    const existing = await sql`SELECT id FROM products WHERE id = ${id} LIMIT 1`;
    if (existing.length === 0) return fail(c, 404, "NOT_FOUND", "Product not found.");

    try {
      await sql.begin(async (tx) => {
        if (body.name !== undefined || body.categoryId !== undefined || body.brand !== undefined || body.description !== undefined) {
          await tx`
            UPDATE products SET
              name = COALESCE(${body.name?.trim() ?? null}, name),
              category_id = ${body.categoryId !== undefined ? body.categoryId : sql`category_id`},
              brand = ${body.brand !== undefined ? body.brand?.trim() || null : sql`brand`},
              description = ${body.description !== undefined ? body.description?.trim() || null : sql`description`}
            WHERE id = ${id}
          `;
        }
        for (const v of body.variants ?? []) {
          if (v.id) {
            await tx`
              UPDATE product_variants SET
                size = ${v.size.trim()},
                colour = ${v.colour?.trim() || null},
                sku = ${v.sku.trim().toUpperCase()},
                barcode = ${v.barcode?.trim().toLowerCase() || null},
                selling_price = ${v.sellingPrice ?? null},
                reorder_level = ${v.reorderLevel ?? 0}
              WHERE id = ${v.id} AND product_id = ${id}
            `;
          } else {
            const rows = await tx<{ id: string }[]>`
              INSERT INTO product_variants (product_id, size, colour, sku, barcode, selling_price, reorder_level)
              VALUES (${id}, ${v.size.trim()}, ${v.colour?.trim() || null}, ${v.sku.trim().toUpperCase()},
                      ${v.barcode?.trim().toLowerCase() || null}, ${v.sellingPrice ?? null}, ${v.reorderLevel ?? 0})
              RETURNING id
            `;
            await tx`INSERT INTO inventory_balances (variant_id) VALUES (${rows[0]!.id}) ON CONFLICT (variant_id) DO NOTHING`;
          }
        }
      });

      await audit(user.id, "product.update", "product", id, { requestId: c.get("requestId") });
      const detail = await fetchProductDetail(id);
      return ok(c, detail);
    } catch (err: unknown) {
      const mapped = mapConstraintError(err);
      if (mapped) return fail(c, mapped.status, mapped.code, mapped.message);
      throw err;
    }
  },
);

productRoutes.post("/:id/deactivate", requireAuth, requirePermission("products.manage"), async (c) => {
  const id = c.req.param("id");
  const result = await sql`UPDATE products SET status = 'deactivated' WHERE id = ${id} RETURNING id`;
  if (result.length === 0) return fail(c, 404, "NOT_FOUND", "Product not found.");
  await audit(c.get("user").id, "product.deactivate", "product", id, { requestId: c.get("requestId") });
  return ok(c, { ok: true });
});

productRoutes.get("/:id/movements", requireAuth, async (c) => {
  // Convenience endpoint mirroring the front-end's product-scoped movement fetch.
  const id = c.req.param("id");
  const rows = await sql`
    SELECT m.id, m.created_at, m.movement_type, m.on_hand_delta, m.reason, m.reference,
           u.name AS actor
    FROM stock_movements m
    JOIN product_variants v ON v.id = m.variant_id
    LEFT JOIN users u ON u.id = m.actor_id
    WHERE v.product_id = ${id}
    ORDER BY m.created_at DESC
    LIMIT 10
  `;
  return ok(c, { items: rows });
});

function mapConstraintError(err: unknown): { status: number; code: string; message: string } | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { code?: string; constraint_name?: string; constraint?: string; detail?: string };
  if (e.code !== "23505") return null;
  const name = e.constraint_name ?? e.constraint ?? "";
  if (name.includes("variants_sku")) return { status: 409, code: "DUPLICATE_SKU", message: "That SKU is already used by another variant." };
  if (name.includes("variants_barcode")) return { status: 409, code: "DUPLICATE_BARCODE", message: "That barcode is already used by another variant." };
  if (name.includes("categories_name")) return { status: 409, code: "DUPLICATE_CATEGORY", message: "A category with this name already exists." };
  if (name.includes("sales_idempotency") || name.includes("idempotency")) return { status: 409, code: "DUPLICATE_REQUEST", message: "This request was already processed." };
  return { status: 409, code: "DUPLICATE", message: "A record with these values already exists." };
}

export function variantLabel(size: string, colour: string | null): string {
  return colour ? `${size} / ${colour}` : size;
}

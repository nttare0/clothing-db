import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db";
import { audit, fail, ok, requireAuth, requirePermission } from "../http";
import { zValidator } from "@hono/zod-validator";
import { hook } from "../validate";
import { normalizePhone } from "../../phone";

// ---------- Suppliers ----------
export const supplierRoutes = new Hono();

const supplierBody = z.object({
  name: z.string().trim().min(1, "Supplier name is required.").max(160),
  contactPerson: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email("Enter a valid email.").max(254).nullable().optional().or(z.literal("")),
  address: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

supplierRoutes.get("/", requireAuth, requirePermission("suppliers.manage"), async (c) => {
  const params = new URL(c.req.url).searchParams;
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const includeArchived = params.get("includeArchived") === "1";
  const like = `%${search}%`;

  const rows = await sql<
    { id: string; name: string; contact_person: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null; status: string; created_at: string; purchases: string; total_cost: string }[]
  >`
    SELECT s.id, s.name, s.contact_person, s.phone, s.email, s.address, s.notes, s.status, s.created_at,
           COALESCE((SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id), 0)::text AS purchases,
           COALESCE((SELECT SUM(p.total_cost) FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'received'), 0)::text AS total_cost
    FROM suppliers s
    WHERE (${includeArchived} OR s.status = 'active')
      AND (${search === "" ? null : like}::text IS NULL OR lower(s.name) LIKE ${like} OR lower(COALESCE(s.contact_person, '')) LIKE ${like})
    ORDER BY s.status, lower(s.name)
  `;
  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      contactPerson: r.contact_person,
      phone: r.phone,
      email: r.email,
      address: r.address,
      notes: r.notes,
      status: r.status,
      purchaseCount: Number(r.purchases),
      totalPurchaseCost: Number(r.total_cost),
    })),
  });
});

supplierRoutes.post(
  "/",
  requireAuth,
  requirePermission("suppliers.manage"),
  zValidator("json", supplierBody, hook),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    let phone: string | null = null;
    if (body.phone && body.phone.trim()) {
      const check = normalizePhone(body.phone);
      if (!check.ok) return fail(c, 400, "INVALID_PHONE", check.message ?? "Enter a valid phone number.");
      phone = check.value;
    }
    const rows = await sql<{ id: string; name: string }[]>`
      INSERT INTO suppliers (name, contact_person, phone, email, address, notes)
      VALUES (${body.name.trim()}, ${body.contactPerson?.trim() || null}, ${phone},
              ${body.email?.trim() || null}, ${body.address?.trim() || null}, ${body.notes?.trim() || null})
      RETURNING id, name
    `;
    const row = rows[0]!;
    await audit(user.id, "supplier.create", "supplier", row.id, { after: { name: row.name }, requestId: c.get("requestId") });
    return ok(c, row, 201);
  },
);

supplierRoutes.patch(
  "/:id",
  requireAuth,
  requirePermission("suppliers.manage"),
  zValidator("json", supplierBody.partial().extend({ status: z.enum(["active", "archived"]).optional() }), hook),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const user = c.get("user");
    const existing = await sql<{ id: string; name: string; contact_person: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null; status: string }[]>`
      SELECT id, name, contact_person, phone, email, address, notes, status FROM suppliers WHERE id = ${id} LIMIT 1
    `;
    const cur = existing[0];
    if (!cur) return fail(c, 404, "NOT_FOUND", "Supplier not found.");

    const name = body.name !== undefined ? body.name.trim() : cur.name;
    const contactPerson = body.contactPerson !== undefined ? body.contactPerson?.trim() || null : cur.contact_person;
    let phone = cur.phone;
    if (body.phone !== undefined) {
      if (body.phone && body.phone.trim()) {
        const check = normalizePhone(body.phone);
        if (!check.ok) return fail(c, 400, "INVALID_PHONE", check.message ?? "Enter a valid phone number.");
        phone = check.value;
      } else {
        phone = null;
      }
    }
    const email = body.email !== undefined ? body.email?.trim() || null : cur.email;
    const address = body.address !== undefined ? body.address?.trim() || null : cur.address;
    const notes = body.notes !== undefined ? body.notes?.trim() || null : cur.notes;
    const status = body.status ?? cur.status;

    await sql`
      UPDATE suppliers SET name = ${name}, contact_person = ${contactPerson}, phone = ${phone},
        email = ${email}, address = ${address}, notes = ${notes}, status = ${status}
      WHERE id = ${id}
    `;
    await audit(user.id, "supplier.update", "supplier", id, {
      before: cur,
      after: { name, contactPerson, phone, email, address, notes, status },
      requestId: c.get("requestId"),
    });
    return ok(c, { id });
  },
);

supplierRoutes.get("/:id/purchases", requireAuth, requirePermission("suppliers.manage"), async (c) => {
  const id = c.req.param("id");
  const rows = await sql`
    SELECT pu.id, pu.reference, pu.reason, pu.received_at, pu.total_cost::text, u.name AS received_by
    FROM purchases pu LEFT JOIN users u ON u.id = pu.received_by
    WHERE pu.supplier_id = ${id} AND pu.status = 'received'
    ORDER BY pu.received_at DESC
    LIMIT 10
  `;
  return ok(c, { items: rows });
});

// ---------- Customers ----------
export const customerRoutes = new Hono();

const customerBody = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  phone: z.string().trim().min(6, "Phone is required.").max(40),
  email: z.string().trim().email("Enter a valid email.").max(254).nullable().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).nullable().optional(),
});

customerRoutes.get("/", requireAuth, requirePermission("customers.manage"), async (c) => {
  const params = new URL(c.req.url).searchParams;
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const includeArchived = params.get("includeArchived") === "1";
  const like = `%${search}%`;

  const rows = await sql<
    { id: string; name: string | null; phone: string | null; email: string | null; notes: string | null; status: string; created_at: string; sales_total: string; sales_count: string }[]
  >`
    SELECT cu.id, cu.name, cu.phone, cu.email, cu.notes, cu.status, cu.created_at,
           COALESCE((SELECT COUNT(*) FROM sales s WHERE s.customer_phone = cu.phone AND s.status = 'completed'), 0)::text AS sales_count,
           COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_phone = cu.phone AND s.status = 'completed'), 0)::text AS sales_total
    FROM customers cu
    WHERE (${includeArchived} OR cu.status = 'active')
      AND (${search === "" ? null : like}::text IS NULL
           OR lower(COALESCE(cu.name, '')) LIKE ${like}
           OR lower(COALESCE(cu.phone, '')) LIKE ${like}
           OR lower(COALESCE(cu.email, '')) LIKE ${like})
    ORDER BY cu.status, lower(COALESCE(cu.name, cu.phone, ''))
  `;
  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      notes: r.notes,
      status: r.status,
      salesCount: Number(r.sales_count),
      salesTotal: Number(r.sales_total),
    })),
  });
});

customerRoutes.post(
  "/",
  requireAuth,
  requirePermission("customers.manage"),
  zValidator("json", customerBody, hook),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const phoneCheck = normalizePhone(body.phone);
    if (!phoneCheck.ok) return fail(c, 400, "INVALID_PHONE", phoneCheck.message ?? "Enter a valid phone number.");
    const phone = phoneCheck.value;
    const last9 = phone.replace(/\D/g, "").slice(-9);
    const dup = await sql<{ id: string }[]>`
      SELECT id FROM customers
      WHERE status = 'active'
        AND (phone = ${phone} OR right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = ${last9})
      LIMIT 1
    `;
    if (dup.length > 0) return fail(c, 409, "DUPLICATE_PHONE", "An active customer with this phone already exists.");
    const rows = await sql<{ id: string }[]>`
      INSERT INTO customers (name, phone, email, notes)
      VALUES (${body.name.trim()}, ${phone}, ${body.email?.trim() || null}, ${body.notes?.trim() || null})
      RETURNING id
    `;
    await audit(user.id, "customer.create", "customer", rows[0]!.id, { after: { name: body.name.trim(), phone }, requestId: c.get("requestId") });
    return ok(c, { id: rows[0]!.id }, 201);
  },
);

customerRoutes.patch(
  "/:id",
  requireAuth,
  requirePermission("customers.manage"),
  zValidator("json", customerBody.partial().extend({ status: z.enum(["active", "archived"]).optional() }), hook),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const user = c.get("user");
    const existing = await sql<{ id: string; name: string | null; phone: string | null; email: string | null; notes: string | null; status: string }[]>`
      SELECT id, name, phone, email, notes, status FROM customers WHERE id = ${id} LIMIT 1
    `;
    const cur = existing[0];
    if (!cur) return fail(c, 404, "NOT_FOUND", "Customer not found.");

    const name = body.name !== undefined ? (body.name.trim() || null) : cur.name;
    let phone = cur.phone;
    if (body.phone !== undefined) {
      const phoneCheck = normalizePhone(body.phone);
      if (!phoneCheck.ok) return fail(c, 400, "INVALID_PHONE", phoneCheck.message ?? "Enter a valid phone number.");
      phone = phoneCheck.value;
    }
    const email = body.email !== undefined ? body.email?.trim() || null : cur.email;
    const notes = body.notes !== undefined ? body.notes?.trim() || null : cur.notes;
    const status = body.status ?? cur.status;

    await sql`UPDATE customers SET name = ${name}, phone = ${phone}, email = ${email}, notes = ${notes}, status = ${status} WHERE id = ${id}`;
    await audit(user.id, "customer.update", "customer", id, { requestId: c.get("requestId") });
    return ok(c, { id });
  },
);

customerRoutes.get("/:id/sales", requireAuth, requirePermission("customers.manage"), async (c) => {
  const id = c.req.param("id");
  const rows = await sql<{ id: string; receipt_number: string; completed_at: string; total: string }[]>`
    SELECT s.id, s.receipt_number, s.completed_at, s.total::text
    FROM sales s
    JOIN customers cu ON cu.phone = s.customer_phone
    WHERE cu.id = ${id} AND s.status = 'completed'
    ORDER BY s.completed_at DESC
    LIMIT 10
  `;
  return ok(c, {
    items: rows.map((r) => ({ id: r.id, receiptNumber: r.receipt_number, completedAt: r.completed_at, total: Number(r.total) })),
  });
});


// ---------- Deletes (owner/manager level via each area's permission) ----------

customerRoutes.delete("/:id", requireAuth, requirePermission("customers.manage"), async (c) => {
  const id = c.req.param("id");
  if (!isUuidParam(id)) return fail(c, 400, "VALIDATION", "We couldn't tell which customer that is.");
  const user = c.get("user");
  const existing = await sql<{ id: string; name: string | null; phone: string }[]>`
    SELECT id, name, phone FROM customers WHERE id = ${id} LIMIT 1
  `;
  const target = existing[0];
  if (!target) return fail(c, 404, "NOT_FOUND", "Customer not found.");
  await sql`DELETE FROM customers WHERE id = ${id}`;
  await audit(user.id, "customer.delete", "customer", id, {
    before: { name: target.name, phone: target.phone },
    requestId: c.get("requestId"),
  });
  return ok(c, { id });
});

supplierRoutes.delete("/:id", requireAuth, requirePermission("suppliers.manage"), async (c) => {
  const id = c.req.param("id");
  if (!isUuidParam(id)) return fail(c, 400, "VALIDATION", "We couldn't tell which supplier that is.");
  const user = c.get("user");
  const existing = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM suppliers WHERE id = ${id} LIMIT 1
  `;
  const target = existing[0];
  if (!target) return fail(c, 404, "NOT_FOUND", "Supplier not found.");
  const refs = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM purchases WHERE supplier_id = ${id}`;
  const count = Number(refs[0]?.count ?? 0);
  if (count > 0) {
    return fail(c, 409, "HAS_PURCHASES", `This supplier has ${count} purchase record${count === 1 ? "" : "s"} — archive it instead of deleting, so purchase history keeps its supplier.`);
  }
  await sql`DELETE FROM suppliers WHERE id = ${id}`;
  await audit(user.id, "supplier.delete", "supplier", id, {
    before: { name: target.name },
    requestId: c.get("requestId"),
  });
  return ok(c, { id });
});

const UUID_PARAM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuidParam(v: string): boolean {
  return UUID_PARAM.test(v);
}

import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db";
import { audit, fail, ok, requireAuth, requirePermission } from "../http";
import { zValidator } from "@hono/zod-validator";
import { hook } from "../validate";

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Salaries & wages",
  "Transport",
  "Packaging & bags",
  "Marketing",
  "Maintenance & repairs",
  "Licences & taxes",
  "Bank & mobile money charges",
  "Other",
] as const;

export const expenseRoutes = new Hono();

const expenseBody = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.").optional(),
  category: z.string().trim().min(1, "Category is required.").max(80),
  amount: z.number().finite().positive("Amount must be greater than zero.").max(1_000_000_000),
  paymentMethod: z.enum(["cash", "mobile_money", "card", "bank_transfer"]).default("cash"),
  payee: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

expenseRoutes.get("/", requireAuth, requirePermission("expenses.manage"), async (c) => {
  const params = new URL(c.req.url).searchParams;
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const category = params.get("category") ?? "all";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "20") || 20));
  const offset = (page - 1) * pageSize;
  const like = `%${search}%`;
  const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

  const rows = await sql<
    {
      id: string;
      expense_date: string;
      category: string;
      amount: string;
      payment_method: string;
      payee: string | null;
      description: string | null;
      entered_by: string | null;
    }[]
  >`
    SELECT e.id, e.expense_date, e.category, e.amount::text, e.payment_method, e.payee, e.description, u.name AS entered_by
    FROM expenses e LEFT JOIN users u ON u.id = e.entered_by
    WHERE
      (${category === "all" ? null : category}::text IS NULL OR e.category = ${category === "all" ? null : category}::text)
      AND (${dateOk(from) ? from : null}::date IS NULL OR e.expense_date >= ${dateOk(from) ? from : null}::date)
      AND (${dateOk(to) ? to : null}::date IS NULL OR e.expense_date <= ${dateOk(to) ? to : null}::date)
      AND (${search === "" ? null : like}::text IS NULL
           OR lower(COALESCE(e.payee, '')) LIKE ${like} OR lower(COALESCE(e.description, '')) LIKE ${like} OR lower(e.category) LIKE ${like})
    ORDER BY e.expense_date DESC, e.created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const totals = await sql<{ total: string; month_total: string; count: string }[]>`
    SELECT COALESCE(SUM(amount), 0)::text AS total,
           COALESCE(SUM(amount) FILTER (WHERE expense_date >= date_trunc('month', CURRENT_DATE)::date), 0)::text AS month_total,
           COUNT(*)::text AS count
    FROM expenses
    WHERE
      (${category === "all" ? null : category}::text IS NULL OR category = ${category === "all" ? null : category}::text)
      AND (${dateOk(from) ? from : null}::date IS NULL OR expense_date >= ${dateOk(from) ? from : null}::date)
      AND (${dateOk(to) ? to : null}::date IS NULL OR expense_date <= ${dateOk(to) ? to : null}::date)
      AND (${search === "" ? null : like}::text IS NULL
           OR lower(COALESCE(payee, '')) LIKE ${like} OR lower(COALESCE(description, '')) LIKE ${like} OR lower(category) LIKE ${like})
  `;

  const byCategory = await sql<{ category: string; total: string }[]>`
    SELECT category, COALESCE(SUM(amount), 0)::text AS total
    FROM expenses
    WHERE expense_date >= date_trunc('month', CURRENT_DATE)::date
    GROUP BY category
    ORDER BY SUM(amount) DESC
  `;

  return ok(c, {
    items: rows.map((r) => ({
      id: r.id,
      expenseDate: r.expense_date,
      category: r.category,
      amount: Number(r.amount),
      paymentMethod: r.payment_method,
      payee: r.payee,
      description: r.description,
      enteredBy: r.entered_by,
    })),
    total: Number(totals[0]?.count ?? 0),
    totalAmount: Number(totals[0]?.total ?? 0),
    monthTotal: Number(totals[0]?.month_total ?? 0),
    monthByCategory: byCategory.map((r) => ({ category: r.category, total: Number(r.total) })),
    page,
    pageSize,
  });
});

expenseRoutes.post(
  "/",
  requireAuth,
  requirePermission("expenses.manage"),
  zValidator("json", expenseBody, hook),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const date = body.expenseDate ?? new Date().toISOString().slice(0, 10);
    const rows = await sql<{ id: string }[]>`
      INSERT INTO expenses (expense_date, category, amount, payment_method, payee, description, entered_by)
      VALUES (${date}, ${body.category.trim()}, ${body.amount.toFixed(2)}, ${body.paymentMethod},
              ${body.payee?.trim() || null}, ${body.description?.trim() || null}, ${user.id})
      RETURNING id
    `;
    await audit(user.id, "expense.create", "expense", rows[0]!.id, {
      after: { category: body.category, amount: body.amount, date },
      requestId: c.get("requestId"),
    });
    return ok(c, { id: rows[0]!.id }, 201);
  },
);

expenseRoutes.patch(
  "/:id",
  requireAuth,
  requirePermission("expenses.manage"),
  zValidator("json", expenseBody.partial(), hook),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const user = c.get("user");
    const existing = await sql<{ id: string; expense_date: string; category: string; amount: string; payment_method: string; payee: string | null; description: string | null }[]>`
      SELECT id, expense_date, category, amount::text, payment_method, payee, description FROM expenses WHERE id = ${id} LIMIT 1
    `;
    const cur = existing[0];
    if (!cur) return fail(c, 404, "NOT_FOUND", "Expense not found.");

    const date = body.expenseDate ?? cur.expense_date;
    const category = body.category?.trim() ?? cur.category;
    const amount = body.amount !== undefined ? body.amount : Number(cur.amount);
    const paymentMethod = body.paymentMethod ?? cur.payment_method;
    const payee = body.payee !== undefined ? body.payee?.trim() || null : cur.payee;
    const description = body.description !== undefined ? body.description?.trim() || null : cur.description;

    await sql`
      UPDATE expenses SET expense_date = ${date}, category = ${category}, amount = ${amount.toFixed(2)},
        payment_method = ${paymentMethod}, payee = ${payee}, description = ${description}, updated_at = now()
      WHERE id = ${id}
    `;
    await audit(user.id, "expense.update", "expense", id, {
      before: { category: cur.category, amount: Number(cur.amount), date: cur.expense_date },
      after: { category, amount, date },
      requestId: c.get("requestId"),
    });
    return ok(c, { id });
  },
);

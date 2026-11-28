import { Hono } from "hono";
import { sql } from "../db";
import { audit, fail, ok, requireAuth } from "../http";

// Owner-only full data export ("download everything / selected tables").
// Streams a JSON document so the response never has to fit in memory at once.
// Sessions, password hashes and reset codes are never exported.
export const exportRoutes = new Hono();

const PAGE = 1000;

const EXPORT_TABLES: Record<string, { select: string; key: "id" | "key" | "variant_id" }> = {
  sales: { select: "*", key: "id" },
  sale_items: { select: "*", key: "id" },
  payments: { select: "*", key: "id" },
  returns: { select: "*", key: "id" },
  return_items: { select: "*", key: "id" },
  purchases: { select: "*", key: "id" },
  purchase_items: { select: "*", key: "id" },
  products: { select: "*", key: "id" },
  product_variants: { select: "*", key: "id" },
  categories: { select: "*", key: "id" },
  inventory_balances: { select: "*", key: "variant_id" },
  stock_movements: { select: "*", key: "id" },
  stock_counts: { select: "*", key: "id" },
  stock_count_items: { select: "*", key: "id" },
  customers: { select: "*", key: "id" },
  suppliers: { select: "*", key: "id" },
  expenses: { select: "*", key: "id" },
  notifications: { select: "*", key: "id" },
  audit_logs: { select: "*", key: "id" },
  settings: { select: "*", key: "key" },
  users: {
    select: "id, name, email, username, role, status, last_sign_in_at, created_at, updated_at, active_until, password_changed_at",
    key: "id",
  },
};

const EXCLUDED_NOTE = "Sessions, password hashes and reset codes are never exported.";

async function* iterateTable(name: string, spec: { select: string; key: "id" | "key" | "variant_id" }) {
  let last: string | null = null;
  for (;;) {
    const rows = (
      last === null
        ? await sql.unsafe(`SELECT ${spec.select} FROM ${name} ORDER BY ${spec.key} ASC LIMIT ${PAGE}`)
        : await sql.unsafe(`SELECT ${spec.select} FROM ${name} WHERE ${spec.key} > $1 ORDER BY ${spec.key} ASC LIMIT ${PAGE}`, [last])
    ) as Record<string, unknown>[];
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < PAGE) return;
    last = String(rows[rows.length - 1]![spec.key]);
  }
}

exportRoutes.get("/", requireAuth, async (c) => {
  const actor = c.get("user");
  if (actor.role !== "owner") {
    return fail(c, 403, "FORBIDDEN", "Only the owner can download the store data.");
  }

  const requested = (new URL(c.req.url).searchParams.get("tables") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const tableNames = requested.length > 0 ? requested : Object.keys(EXPORT_TABLES);
  const unknown = tableNames.filter((t) => !(t in EXPORT_TABLES));
  if (unknown.length > 0) {
    return fail(c, 400, "UNKNOWN_TABLE", `Don't know how to export: ${unknown.join(", ")}`);
  }

  await audit(actor.id, "data.export", "system", null, {
    after: { tables: tableNames },
    requestId: c.get("requestId"),
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            `{"format":"clothflow-export","version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"note":${JSON.stringify(EXCLUDED_NOTE)},"tables":{`,
          ),
        );
        let tableIndex = 0;
        for (const name of tableNames) {
          const spec = EXPORT_TABLES[name]!;
          controller.enqueue(encoder.encode(`${tableIndex === 0 ? "" : ","}${JSON.stringify(name)}:[`));
          let firstRow = true;
          for await (const chunk of iterateTable(name, spec)) {
            let out = "";
            for (const row of chunk) {
              out += `${firstRow ? "" : ","}${JSON.stringify(row)}`;
              firstRow = false;
            }
            controller.enqueue(encoder.encode(out));
          }
          controller.enqueue(encoder.encode("]"));
          tableIndex += 1;
        }
        controller.enqueue(encoder.encode("}}"));
        controller.close();
      } catch (err) {
        console.error("export_stream_failed", err);
        controller.error(err);
      }
    },
  });

  return c.body(stream, 200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="clothflow-export-${stamp}.json"`,
    "Cache-Control": "no-store",
  });
});

// Small helper for the export page: which datasets exist and how many rows each has.
exportRoutes.get("/tables", requireAuth, async (c) => {
  const actor = c.get("user");
  if (actor.role !== "owner") {
    return fail(c, 403, "FORBIDDEN", "Only the owner can download the store data.");
  }
  return ok(c, { tables: Object.keys(EXPORT_TABLES), excluded: EXCLUDED_NOTE });
});

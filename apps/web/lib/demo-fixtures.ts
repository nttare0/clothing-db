// Request dispatcher for demo mode. Returns `undefined` for any path without a
// fixture — callers fall back to the real API (settings, staff, audit logs are
// always real). Responses match what the pages render, not the full server shape.

import { getRememberedDemoSale, rememberDemoSale } from "./demo-state";
import {
  demoCategories,
  demoCustomers,
  demoExpenses,
  demoNotifications,
  demoProducts,
  demoReturns,
  demoSales,
  demoStockCountSessions,
  demoSuppliers,
  demoVariants,
  dashboardFixture,
  expensesReportFixture,
  inventoryReportFixture,
  movementFixtureRows,
  pnlReportFixture,
  salesReportFixture,
} from "./demo-data";

const num = (v: string | null, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function paginate<T>(items: T[], params: URLSearchParams, pageSize = 20) {
  const page = num(params.get("page"), 1);
  const size = num(params.get("pageSize"), pageSize);
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), total: items.length, page, pageSize: size };
}

function includes(haystack: string | null | undefined, needle: string) {
  return (haystack ?? "").toLowerCase().includes(needle);
}

export function demoApiGet(rawPath: string): unknown | undefined {
  const path = rawPath.split("#")[0]!;
  const url = new URL(path, "https://demo.invalid");
  const pathname = url.pathname;
  const params = url.searchParams;
  const search = (params.get("search") ?? params.get("q") ?? "").trim().toLowerCase();

  // ---------- dashboard & reports ----------
  if (pathname === "/dashboard") return dashboardFixture(params.get("range") ?? "today");
  if (pathname === "/reports/sales") return salesReportFixture(params.get("range") ?? "30d");
  if (pathname === "/reports/inventory") return inventoryReportFixture();
  if (pathname === "/reports/pnl") return pnlReportFixture(params.get("range") ?? "30d");
  if (pathname === "/reports/expenses") return expensesReportFixture(params.get("range") ?? "30d");

  // ---------- catalogue ----------
  if (pathname === "/categories") {
    return { items: demoCategories, total: demoCategories.length };
  }
  if (pathname === "/products") {
    const categoryId = params.get("category");
    const lowStock = params.get("lowStock") === "1";
    const status = params.get("status") ?? "active";
    let items = demoProducts.filter((p) => status === "all" || p.status === status);
    if (categoryId) items = items.filter((p) => p.categoryId === categoryId);
    if (lowStock) items = items.filter((p) => p.lowStock);
    if (search) {
      items = items.filter((p) =>
        [p.name, p.brand ?? "", p.category, ...p.variants.map((v) => v.sku)].some((f) => includes(f, search)),
      );
    }
    return paginate(
      items.map(({ inventoryValue: _ignored, variants: _variants, ...row }) => row),
      params,
    );
  }
  const productMatch = pathname.match(/^\/products\/(de000000[^/?]*)$/);
  if (productMatch) {
    const product = demoProducts.find((p) => p.id === productMatch[1]);
    if (!product) return undefined;
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      description: product.description,
      category: product.category,
      status: product.status,
      createdAt: product.createdAt,
      variants: product.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        barcode: null,
        size: v.size,
        colour: v.colour,
        sellingPrice: v.price,
        movingAverageCost: v.cost,
        onHand: v.onHand,
        sellable: v.onHand,
        damaged: 0,
        reorderLevel: v.reorderLevel,
      })),
    };
  }

  // ---------- POS catalogue browse ----------
  if (pathname === "/pos/catalog") {
    const q = search;
    const categoryId = (params.get("categoryId") ?? "").trim();
    const page = num(params.get("page"), 1);
    const pageSize = Math.min(96, Math.max(1, Number(params.get("pageSize")) || 48));
    const rows = demoVariants.filter((v) => {
      if (q && ![v.productName, v.sku, v.label, v.brand ?? "", v.category].some((f) => includes(f, q))) return false;
      if (categoryId && demoCategories.find((c) => c.name === v.category)?.id !== categoryId) return false;
      return true;
    });
    const total = rows.length;
    const items = rows.slice((page - 1) * pageSize, page * pageSize).map((v) => ({
      variantId: v.id,
      productId: v.productId,
      productName: v.productName,
      label: v.label,
      sku: v.sku,
      price: v.price,
      sellable: v.onHand,
      brand: v.brand ?? null,
      categoryId: demoCategories.find((c) => c.name === v.category)?.id ?? null,
      category: v.category,
    }));
    return { items, total, page, pageSize };
  }

  // ---------- POS / variants search ----------
  if (pathname === "/pos/search") {
    const q = (params.get("q") ?? "").trim().toLowerCase();
    const items = demoVariants
      .filter((v) => !q || [v.productName, v.sku, v.label, v.colour ?? "", v.brand ?? ""].some((f) => includes(f, q)))
      .slice(0, 12)
      .map((v) => ({
        variantId: v.id,
        productId: v.productId,
        productName: v.productName,
        label: v.label,
        sku: v.sku,
        price: v.price,
        sellable: v.onHand,
      }));
    return { items };
  }
  if (pathname === "/variants/lookup") {
    const id = params.get("variantId");
    const v = demoVariants.find((x) => x.id === id);
    return v
      ? [{ variantId: v.id, productName: v.productName, label: v.label, sku: v.sku, price: v.price, sellable: v.onHand }]
      : [];
  }

  // ---------- inventory ledger ----------
  if (pathname === "/stock-movements") {
    const productId = params.get("productId");
    const typeFilter = (params.get("type") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    let rows = movementFixtureRows();
    if (productId) rows = rows.filter((r) => r.productId === productId);
    if (typeFilter.length) rows = rows.filter((r) => typeFilter.includes(String(r.type)));
    if (search) {
      rows = rows.filter((r) =>
        [r.productName, r.sku, r.reference, r.actor, r.label].some((f) => includes(String(f), search)),
      );
    }
    const limit = num(params.get("limit"), 0);
    if (limit) return { items: rows.slice(0, limit), total: rows.length };
    return paginate(rows, params);
  }
  if (pathname === "/stock-in") {
    const rows = [
      { id: "de000000-0000-4000-7200-000000000003", reference: "GRN-0009", reason: "purchase", receivedAt: new Date(Date.now() - 2 * 86400000).toISOString(), receivedBy: "Owner", itemCount: 6, totalCost: 640000 },
      { id: "de000000-0000-4000-7200-000000000002", reference: "GRN-0008", reason: "purchase", receivedAt: new Date(Date.now() - 9 * 86400000).toISOString(), receivedBy: "Owner", itemCount: 10, totalCost: 1150000 },
      { id: "de000000-0000-4000-7200-000000000001", reference: "GRN-0007", reason: "opening_stock", receivedAt: new Date(Date.now() - 30 * 86400000).toISOString(), receivedBy: "Owner", itemCount: 34, totalCost: 3712800 },
    ];
    return paginate(rows, params, 20);
  }
  if (pathname === "/stock-counts") {
    return { items: demoStockCountSessions };
  }
  if (pathname === "/stock-counts/countable") {
    const categoryId = params.get("category");
    let rows = demoVariants;
    if (categoryId) rows = rows.filter((v) => v.productId && demoProducts.find((p) => p.id === v.productId)?.categoryId === categoryId);
    const q = (params.get("search") ?? "").trim().toLowerCase();
    if (q) rows = rows.filter((v) => [v.productName, v.sku, v.label].some((f) => includes(f, q)));
    return {
      items: rows.map((v) => ({
        variantId: v.id,
        productName: v.productName,
        label: v.label,
        sku: v.sku,
        onHand: v.onHand,
        sellable: v.onHand,
        category: v.category,
      })),
    };
  }

  // ---------- sales, returns, customers, suppliers ----------
  if (pathname === "/sales") {
    const status = params.get("status") ?? "all";
    let rows = demoSales.map((s) => ({
      id: s.id,
      receiptNumber: s.receiptNumber,
      completedAt: s.completedAt,
      cashierName: s.cashierName,
      total: s.total,
      paymentMethods: s.paymentMethods,
      returnStatus: s.returnStatus,
    }));
    if (status !== "all") rows = rows.filter((r) => r.returnStatus === status);
    if (search) rows = rows.filter((r) => includes(r.receiptNumber, search) || includes(r.cashierName, search));
    return paginate(rows, params);
  }
  const demoReceipt = pathname.match(/^\/sales\/(DEMO-[A-Za-z0-9-]+)$/);
  if (demoReceipt) {
    const fixture = demoSaleDetail(demoReceipt[1]);
    if (fixture) return fixture;
    return undefined; // stale demo receipt after reload → real API 404 is honest
  }
  const saleMatch = pathname.match(/^\/sales\/(de000000[^/?]*)$/);
  if (saleMatch) {
    const sale = demoSales.find((s) => s.id === saleMatch[1]);
    if (!sale) return undefined;
    return {
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      completedAt: sale.completedAt,
      cashierName: sale.cashierName,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      changeDue: sale.changeDue,
      customerPhone: sale.customerPhone,
      items: sale.items.map((i) => ({
        label: i.label,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        lineTotal: i.lineTotal,
      })),
      payments: sale.payments,
    };
  }
  if (pathname === "/returns") {
    let rows = [...demoReturns];
    if (search) rows = rows.filter((r) => includes(r.receiptNumber, search) || includes(r.reason, search));
    return paginate(rows, params);
  }
  if (pathname === "/suppliers") {
    const status = params.get("status") ?? "active";
    let rows = demoSuppliers.filter((s) => status === "all" || s.status === status);
    if (search) rows = rows.filter((s) => includes(s.name, search) || includes(s.contactPerson, search) || includes(s.phone, search));
    return { items: rows, total: rows.length };
  }
  const supplierPurchases = pathname.match(/^\/suppliers\/(de000000[^/]*)\/purchases$/);
  if (supplierPurchases) {
    return {
      items: [
        { id: "de000000-0000-4000-7300-000000000002", reference: "GRN-0008", reason: "purchase", received_at: new Date(Date.now() - 9 * 86400000).toISOString(), total_cost: "1150000", received_by: "Owner" },
        { id: "de000000-0000-4000-7300-000000000001", reference: "GRN-0003", reason: "purchase", received_at: new Date(Date.now() - 44 * 86400000).toISOString(), total_cost: "1250000", received_by: "Owner" },
      ],
    };
  }
  if (pathname === "/customers") {
    let rows = demoCustomers;
    if (search) rows = rows.filter((c) => includes(c.name, search) || includes(c.phone, search));
    return { items: rows, total: rows.length };
  }
  const customerSales = pathname.match(/^\/customers\/(de000000[^/]*)\/sales$/);
  if (customerSales) {
    const id = customerSales[1];
    const customer = demoCustomers.find((c) => c.id === id);
    const phone = customer?.phone;
    const items = demoSales
      .filter((s) => s.customerPhone && s.customerPhone === phone)
      .slice(0, 10)
      .map((s) => ({ id: s.id, receiptNumber: s.receiptNumber, completedAt: s.completedAt, total: s.total }));
    return { items };
  }

  // ---------- expenses ----------
  if (pathname === "/expenses") {
    let rows = [...demoExpenses];
    if (search) rows = rows.filter((e) => [e.category, e.payee ?? "", e.description ?? ""].some((f) => includes(f, search)));
    const pageSize = num(params.get("pageSize"), 20);
    const page = num(params.get("page"), 1);
    const start = (page - 1) * pageSize;
    const totalAmount = rows.reduce((sum, e) => sum + e.amount, 0);
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthRows = rows.filter((e) => e.expenseDate.startsWith(monthPrefix));
    const monthByCategory = new Map<string, number>();
    for (const e of monthRows) monthByCategory.set(e.category, (monthByCategory.get(e.category) ?? 0) + e.amount);
    return {
      items: rows.slice(start, start + pageSize).map((e) => ({ ...e, expenseDate: e.expenseDate })),
      total: rows.length,
      totalAmount,
      monthTotal: monthRows.reduce((sum, e) => sum + e.amount, 0),
      monthByCategory: [...monthByCategory.entries()].map(([category, total]) => ({ category, total })),
      page,
      pageSize,
    };
  }

  // ---------- notifications ----------
  if (pathname === "/notifications") {
    return { items: demoNotifications };
  }
  if (pathname === "/notifications/unread-count") {
    return { unread: demoNotifications.filter((n) => !n.readAt).length };
  }

  return undefined;
}

/** Synthetic receipt for the demo POS — clearly DEMO-numbered, never persisted. */
export function demoCompletedSale(body: unknown): unknown {
  const input = (body ?? {}) as {
    items?: { variantId: string; quantity: number }[];
    discountTotal?: number;
    payments?: { method: string; amount: number; reference: string | null }[];
    customerPhone?: string | null;
  };
  const items = (input.items ?? []).map((line) => {
    const variant = demoVariants.find((v) => v.id === line.variantId);
    const price = variant?.price ?? 0;
    const qty = Math.max(1, line.quantity);
    return {
      variantId: line.variantId,
      productId: variant?.productId ?? "de000000-0000-4000-2000-000000000000",
      label: variant ? `${variant.productName} · ${variant.label}` : "Demo item",
      sku: variant?.sku ?? "DEMO",
      quantity: qty,
      unitPrice: price,
    };
  });
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const discountTotal = Math.min(Math.max(0, Number(input.discountTotal) || 0), subtotal);
  const total = Math.max(0, subtotal - discountTotal);
  const payments = (input.payments ?? []).map((p) => ({
    method: p.method,
    amount: Number(p.amount) || 0,
    reference: p.reference ?? null,
  }));
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const receiptNumber = `DEMO-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const sale = {
    id: receiptNumber,
    receiptNumber,
    subtotal,
    discountTotal,
    total,
    changeDue: Math.max(0, paid - total),
    completedAt: new Date().toISOString(),
    customerPhone: input.customerPhone ?? null,
    items,
    payments,
  };
  rememberDemoSale(sale);
  return sale;
}

/** Receipt page fixture for a just-completed demo sale. */
function demoSaleDetail(id: string): unknown {
  const sale = getRememberedDemoSale(id);
  if (!sale) return undefined;
  // Fixtures are the unwrapped payload (the client's `api()` does payload.data ?? payload).
  return {
    id: sale.id,
    receiptNumber: sale.receiptNumber,
    completedAt: sale.completedAt,
    cashierName: "Demo cashier",
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    total: sale.total,
    changeDue: sale.changeDue,
    customerPhone: sale.customerPhone,
    items: sale.items.map((item, i) => ({
      id: `demo-line-${i}`,
      productId: item.productId,
      label: item.label,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.unitPrice * item.quantity,
    })),
    payments: sale.payments,
  };
}

// Client-side demo dataset for ClothFlow — a fully populated clothing store
// used to preview the app before any real data exists. NOTHING here is ever
// sent to the database; reads are served from memory and writes that target
// demo rows are rejected or simulated. The demo disappears on the first real
// action (a completed sale, a created product, a stock receipt) or when the
// user dismisses it from the banner.

const D = 24 * 60 * 60 * 1000;

function daysAgo(days: number, hour = 11, minute = 0): Date {
  const d = new Date(Date.now() - days * D);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const iso = (d: Date) => d.toISOString();
const DEMO_ID = (n: number) => `de000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VAR_ID = (n: number) => `de000000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const SALE_ID = (n: number) => `de000000-0000-4000-3000-${String(n).padStart(12, "0")}`;

export type DemoVariant = {
  id: string;
  productId: string;
  productName: string;
  brand: string | null;
  category: string;
  size: string;
  colour: string | null;
  sku: string;
  label: string;
  price: number;
  cost: number;
  onHand: number;
  reorderLevel: number;
};

type VariantSpec = [size: string, colour: string | null, sku: string, onHand: number, reorder?: number];

type ProductSpec = {
  id: number;
  name: string;
  brand: string | null;
  categoryId: number;
  category: string;
  price: number;
  cost: number;
  variants: VariantSpec[];
};

const CATEGORY_SPECS = [
  { id: 1, name: "T-Shirts", description: "Everyday tees and casuals" },
  { id: 2, name: "Jeans & Denim", description: "Jeans, shorts and denim" },
  { id: 3, name: "Dresses", description: "Wrap dresses, skirts and occasionwear" },
  { id: 4, name: "Hoodies & Sweats", description: "Heavyweight fleece and hoodies" },
  { id: 5, name: "Shirts", description: "Oxfords, linen and formal shirts" },
  { id: 6, name: "Accessories", description: "Belts, bags and finishing touches" },
];

const PRODUCT_SPECS: ProductSpec[] = [
  { id: 1, name: "Classic Cotton Tee", brand: "Denver", categoryId: 1, category: "T-Shirts", price: 8500, cost: 3200,
    variants: [["S", "Black", "TEE-BLK-S", 40], ["M", "Black", "TEE-BLK-M", 35], ["L", "Black", "TEE-BLK-L", 30], ["XL", "Black", "TEE-BLK-XL", 25]] },
  { id: 2, name: "Graphic Band Tee", brand: "Denver", categoryId: 1, category: "T-Shirts", price: 9500, cost: 3400,
    variants: [["S", "Washed Black", "GRA-BLK-S", 30], ["M", "Washed Black", "GRA-BLK-M", 28], ["L", "Washed Black", "GRA-BLK-L", 12]] },
  { id: 3, name: "Slim Stretch Jeans", brand: "Denver", categoryId: 2, category: "Jeans & Denim", price: 25000, cost: 11000,
    variants: [["30", "Blue", "JEN-BLU-30", 18], ["32", "Blue", "JEN-BLU-32", 22], ["34", "Blue", "JEN-BLU-34", 15]] },
  { id: 4, name: "Cargo Shorts", brand: "Denver", categoryId: 2, category: "Jeans & Denim", price: 19000, cost: 8200,
    variants: [["32", "Khaki", "CGO-KHK-32", 14], ["34", "Khaki", "CGO-KHK-34", 10]] },
  { id: 5, name: "Ankara Wrap Dress", brand: "Umuseke", categoryId: 3, category: "Dresses", price: 35000, cost: 15000,
    variants: [["M", "Multi", "DRS-MUL-M", 12], ["L", "Multi", "DRS-MUL-L", 9]] },
  { id: 6, name: "Floral Midi Skirt", brand: "Umuseke", categoryId: 3, category: "Dresses", price: 22000, cost: 9000,
    variants: [["M", "Terracotta", "SKT-TER-M", 10], ["L", "Terracotta", "SKT-TER-L", 8]] },
  { id: 7, name: "Oversized Hoodie", brand: "Northline", categoryId: 4, category: "Hoodies & Sweats", price: 28000, cost: 12500,
    variants: [["M", "Grey", "HOD-GRY-M", 20], ["L", "Grey", "HOD-GRY-L", 14]] },
  { id: 8, name: "Zip Hoodie", brand: "Northline", categoryId: 4, category: "Hoodies & Sweats", price: 32000, cost: 14000,
    variants: [["M", "Black", "ZIP-BLK-M", 6], ["L", "Black", "ZIP-BLK-L", 8]] },
  { id: 9, name: "Oxford Shirt", brand: "Lumen", categoryId: 5, category: "Shirts", price: 18000, cost: 8000,
    variants: [["M", "White", "OXF-WHT-M", 25], ["L", "White", "OXF-WHT-L", 22], ["XL", "White", "OXF-WHT-XL", 3]] },
  { id: 10, name: "Linen Shirt", brand: "Lumen", categoryId: 5, category: "Shirts", price: 21000, cost: 9000,
    variants: [["M", "Natural", "LIN-NTL-M", 16], ["L", "Natural", "LIN-NTL-L", 12]] },
  { id: 11, name: "Leather Belt", brand: "Kigali Leather Co.", categoryId: 6, category: "Accessories", price: 12000, cost: 5000,
    variants: [["One size", "Brown", "BLT-BRN-OS", 6]] },
  { id: 12, name: "Canvas Tote", brand: "Northline", categoryId: 6, category: "Accessories", price: 9500, cost: 4000,
    variants: [["One size", "Natural", "TOT-NTL-OS", 18]] },
];

export const demoCategories = CATEGORY_SPECS.map((c) => ({
  id: DEMO_ID(7000 + c.id),
  name: c.name,
  description: c.description,
  active: true,
  productCount: PRODUCT_SPECS.filter((p) => p.categoryId === c.id).length,
}));

export const demoVariants: DemoVariant[] = (() => {
  let counter = 0;
  return PRODUCT_SPECS.flatMap((p) =>
    p.variants.map(([size, colour, sku, onHand, reorder]) => ({
    id: VAR_ID(++counter),
    productId: DEMO_ID(8000 + p.id),
    productName: p.name,
    brand: p.brand,
    category: p.category,
    size,
    colour,
    sku,
    label: colour ? `${size} / ${colour}` : size,
    price: p.price,
    cost: p.cost,
    onHand,
    reorderLevel: reorder ?? 5,
    })),
  );
})();

export const demoProducts = PRODUCT_SPECS.map((p) => {
  const variants = demoVariants.filter((v) => v.productId === DEMO_ID(8000 + p.id));
  const totalSellable = variants.reduce((sum, v) => sum + v.onHand, 0);
  return {
    id: DEMO_ID(8000 + p.id),
    name: p.name,
    brand: p.brand,
    description: `Demo product — ${p.name.toLowerCase()} from ${p.brand ?? "the demo collection"}.`,
    categoryId: DEMO_ID(7000 + p.categoryId),
    category: p.category,
    status: "active",
    createdAt: iso(daysAgo(60)),
    variantCount: variants.length,
    totalSellable,
    minPrice: Math.min(...variants.map((v) => v.price)),
    lowStock: variants.some((v) => v.onHand <= v.reorderLevel),
    inventoryValue: variants.reduce((sum, v) => sum + v.onHand * v.cost, 0),
    variants,
  };
});

// ---------- sales history (deterministic seeded RNG) ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261127);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;

const DEMO_CUSTOMER_PHONES = ["+250788123456", "+250723456789", "+250789234567", "+250731222333", "+250788000111"];
const PAYMENT_SPLIT: Array<[string, number]> = [["cash", 0.5], ["mobile_money", 0.85], ["card", 0.95], ["bank_transfer", 1]];
const CASHIERS = ["Diane Uwase", "Owner"];

export type DemoSaleItem = { variantId: string; label: string; sku: string; quantity: number; unitPrice: number; unitCost: number; discount: number; lineTotal: number };
export type DemoSale = {
  id: string;
  receiptNumber: string;
  completedAt: string;
  cashierName: string;
  customerPhone: string | null;
  returnStatus: "none" | "partial" | "full";
  subtotal: number;
  discountTotal: number;
  total: number;
  changeDue: number;
  paymentMethods: string[];
  items: DemoSaleItem[];
  payments: { method: string; amount: number; reference: string | null }[];
};

export const demoSales: DemoSale[] = (() => {
  const sales: DemoSale[] = [];
  let receipt = 1040;
  const plan: Array<{ daysAgo: number; hour: number; lines: number }> = [
    { daysAgo: 0, hour: 10, lines: 2 },
    { daysAgo: 0, hour: 15, lines: 1 },
    { daysAgo: 1, hour: 11, lines: 3 },
    { daysAgo: 2, hour: 14, lines: 2 },
    { daysAgo: 3, hour: 12, lines: 1 },
    { daysAgo: 5, hour: 16, lines: 2 },
    { daysAgo: 7, hour: 10, lines: 3 },
    { daysAgo: 9, hour: 13, lines: 2 },
    { daysAgo: 12, hour: 15, lines: 1 },
    { daysAgo: 14, hour: 11, lines: 2 },
    { daysAgo: 16, hour: 14, lines: 3 },
    { daysAgo: 19, hour: 12, lines: 1 },
  ];

  for (const slot of plan) {
    receipt += 1;
    const chosen = new Set<DemoVariant>();
    while (chosen.size < slot.lines) {
      chosen.add(pick(demoVariants));
    }
    const items: DemoSaleItem[] = [...chosen].map((variant) => {
      const quantity = rand() < 0.75 ? 1 : 2;
      const discount = rand() < 0.25 ? Math.round((variant.price * 0.1) / 100) * 100 : 0;
      return {
        variantId: variant.id,
        label: `${variant.productName} · ${variant.label}`,
        sku: variant.sku,
        quantity,
        unitPrice: variant.price,
        unitCost: variant.cost,
        discount,
        lineTotal: variant.price * quantity - discount * quantity,
      };
    });
    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const discountTotal = items.reduce((sum, i) => sum + i.discount * i.quantity, 0);
    const total = Math.max(0, subtotal - discountTotal);
    const roll = rand();
    const method = PAYMENT_SPLIT.find(([, cutoff]) => roll <= cutoff)![0];
    const hasPhone = rand() < 0.6;
    sales.push({
      id: SALE_ID(1000 + receipt),
      receiptNumber: `CF-${receipt}`,
      completedAt: iso(daysAgo(slot.daysAgo, slot.hour, Math.floor(rand() * 60))),
      cashierName: pick(CASHIERS),
      customerPhone: hasPhone ? pick(DEMO_CUSTOMER_PHONES) : null,
      returnStatus: "none",
      subtotal,
      discountTotal,
      total,
      changeDue: method === "cash" ? Math.ceil(total / 1000) * 1000 - total : 0,
      paymentMethods: [method],
      items,
      payments: [
        {
          method,
          amount: total,
          reference: method === "mobile_money" ? `MP${String(Math.floor(rand() * 1e9)).padStart(9, "0")}` : null,
        },
      ],
    });
  }
  return sales.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
})();

export const demoReturns = [
  { id: "de000000-0000-4000-2000-000000000001", createdAt: iso(daysAgo(2, 17)), receiptNumber: demoSales[5]?.receiptNumber ?? "CF-1036", saleId: demoSales[5]?.id ?? SALE_ID(1036), refundMethod: "mobile_money", refundTotal: 8500, items: 1, reason: "wrong_size", processedBy: "Diane Uwase" },
  { id: "de000000-0000-4000-2000-000000000002", createdAt: iso(daysAgo(6, 12)), receiptNumber: demoSales[7]?.receiptNumber ?? "CF-1034", saleId: demoSales[7]?.id ?? SALE_ID(1034), refundMethod: "cash", refundTotal: 9500, items: 1, reason: "customer_return", processedBy: "Owner" },
  { id: "de000000-0000-4000-2000-000000000003", createdAt: iso(daysAgo(11, 15)), receiptNumber: demoSales[9]?.receiptNumber ?? "CF-1031", saleId: demoSales[9]?.id ?? SALE_ID(1031), refundMethod: "card", refundTotal: 19000, items: 1, reason: "defect", processedBy: "Diane Uwase" },
];

export const demoExpenses = [
  { id: "de000000-0000-4000-1000-000000000001", expenseDate: iso(daysAgo(4)).slice(0, 10), category: "Rent", amount: 150000, paymentMethod: "bank_transfer", payee: "Kigali Property Co.", description: "Shop rent — Kimironko plaza", enteredBy: "Owner" },
  { id: "de000000-0000-4000-1000-000000000002", expenseDate: iso(daysAgo(6)).slice(0, 10), category: "Utilities", amount: 46000, paymentMethod: "mobile_money", payee: "EUCL", description: "Electricity token", enteredBy: "Owner" },
  { id: "de000000-0000-4000-1000-000000000003", expenseDate: iso(daysAgo(8)).slice(0, 10), category: "Transport", amount: 18500, paymentMethod: "cash", payee: "Moto & delivery", description: "Stock from Apex Garments", enteredBy: "Diane Uwase" },
  { id: "de000000-0000-4000-1000-000000000004", expenseDate: iso(daysAgo(10)).slice(0, 10), category: "Marketing", amount: 60000, paymentMethod: "mobile_money", payee: "Instagram Ads", description: "Weekend campaign boost", enteredBy: "Owner" },
  { id: "de000000-0000-4000-1000-000000000005", expenseDate: iso(daysAgo(12)).slice(0, 10), category: "Supplies", amount: 32500, paymentMethod: "cash", payee: "Simba stationery", description: "Receipt paper, tags and bags", enteredBy: "Diane Uwase" },
  { id: "de000000-0000-4000-1000-000000000006", expenseDate: iso(daysAgo(15)).slice(0, 10), category: "Salaries", amount: 280000, paymentMethod: "bank_transfer", payee: "Diane Uwase", description: "Monthly payroll — assistant", enteredBy: "Owner" },
  { id: "de000000-0000-4000-1000-000000000007", expenseDate: iso(daysAgo(17)).slice(0, 10), category: "Transport", amount: 24000, paymentMethod: "cash", payee: "Moto & delivery", description: "Customer deliveries (Nyamirambo)", enteredBy: "Diane Uwase" },
  { id: "de000000-0000-4000-1000-000000000008", expenseDate: iso(daysAgo(20)).slice(0, 10), category: "Maintenance", amount: 35000, paymentMethod: "mobile_money", payee: "Kwizera repairs", description: "POS printer service", enteredBy: "Owner" },
];

export const demoSuppliers = [
  { id: "de000000-0000-4000-6000-000000000001", name: "Kigali Textile Wholesale", contactPerson: "Jean-Bosco M.", phone: "+250788000099", email: "orders@ktwholesale.rw", address: "Kimironko, Kigali", notes: "Tees and denim bulk packs", status: "active", purchaseCount: 4, totalPurchaseCost: 2400000 },
  { id: "de000000-0000-4000-6000-000000000002", name: "Apex Garments", contactPerson: "Angelique K.", phone: "+250723111222", email: "sales@apexgarments.rw", address: "Nyabugogo, Kigali", notes: "Northline hoodies and totes", status: "active", purchaseCount: 2, totalPurchaseCost: 1150000 },
  { id: "de000000-0000-4000-6000-000000000003", name: "Umuseke Fashion Studio", contactPerson: "Chantal I.", phone: "+250789000333", email: "hello@umuseke.rw", address: "Kacyiru, Kigali", notes: "In-house Ankara prints", status: "active", purchaseCount: 3, totalPurchaseCost: 1680000 },
  { id: "de000000-0000-4000-6000-000000000004", name: "Kigali Leather Co.", contactPerson: "Eric N.", phone: "+250731444555", email: "eric@kgleather.rw", address: "Gikomero, Kigali", notes: "Belts — small-batch", status: "active", purchaseCount: 1, totalPurchaseCost: 240000 },
];

export const demoCustomers = [
  { id: "de000000-0000-4000-5000-000000000001", name: "Aline Ingabire", phone: "+250788123456", email: null, notes: "Prefers mobile money", status: "active", salesCount: 4, salesTotal: 118000 },
  { id: "de000000-0000-4000-5000-000000000002", name: "Patrick Habimana", phone: "+250723456789", email: "pat.h@example.rw", notes: null, status: "active", salesCount: 3, salesTotal: 84500 },
  { id: "de000000-0000-4000-5000-000000000003", name: "Consolee Iradukunda", phone: "+250789234567", email: null, notes: "Sizes M and L", status: "active", salesCount: 2, salesTotal: 64000 },
  { id: "de000000-0000-4000-5000-000000000004", name: "Eric Mugisha", phone: "+250731222333", email: null, notes: null, status: "active", salesCount: 2, salesTotal: 57000 },
  { id: "de000000-0000-4000-5000-000000000005", name: "Divine Uwase", phone: "+250788000111", email: null, notes: "Wholesale enquiry (Jan)", status: "active", salesCount: 1, salesTotal: 35000 },
];

export const demoNotifications = [
  { id: "de000000-0000-4000-4000-000000000001", createdAt: iso(daysAgo(0, 8)), severity: "critical" as const, title: "Low stock — Oxford Shirt XL", body: "Only 3 left (reorder at 5).", actionLabel: "View inventory", actionHref: "/inventory?lowStock=1", readAt: null },
  { id: "de000000-0000-4000-4000-000000000002", createdAt: iso(daysAgo(0, 9)), severity: "warning" as const, title: "Low stock — Leather Belt", body: "6 left (reorder at 5).", actionLabel: "Reorder now", actionHref: "/stock-in/new", readAt: null },
  { id: "de000000-0000-4000-4000-000000000003", createdAt: iso(daysAgo(1, 18)), severity: "warning" as const, title: "Low stock — Zip Hoodie M", body: "6 left (reorder at 5).", actionLabel: "View inventory", actionHref: "/inventory?lowStock=1", readAt: null },
  { id: "de000000-0000-4000-4000-000000000004", createdAt: iso(daysAgo(3, 10)), severity: "info" as const, title: "New in — Ankara Wrap Dress", body: "12 units received from Umuseke Fashion Studio.", actionLabel: "View product", actionHref: `/products/${DEMO_ID(8005)}`, readAt: iso(daysAgo(2)) },
];

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function rangeStart(range: string): Date {
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(Date.now() - days * D);
}

function salesInRange(range: string): DemoSale[] {
  const start = rangeStart(range).getTime();
  return demoSales.filter((s) => new Date(s.completedAt).getTime() >= start);
}

export function dashboardFixture(range: string) {
  const sales = salesInRange(range);
  const salesTotal = sales.reduce((sum, s) => sum + s.total, 0);
  const byDay = new Map<string, number>();
  for (const s of sales) {
    const key = dayKey(new Date(s.completedAt));
    byDay.set(key, (byDay.get(key) ?? 0) + s.total);
  }
  const trend = Array.from({ length: range === "today" ? 1 : range === "7d" ? 7 : 14 }).map((_, i) => {
    const d = new Date(Date.now() - (i === 0 ? 0 : i) * D);
    return { date: dayKey(d), total: byDay.get(dayKey(d)) ?? 0 };
  }).reverse();

  const units = new Map<string, { name: string; units: number; revenue: number }>();
  for (const s of sales) {
    for (const item of s.items) {
      const key = item.variantId;
      const entry = units.get(key) ?? { name: item.label.split(" · ")[0]!, units: 0, revenue: 0 };
      entry.units += item.quantity;
      entry.revenue += item.lineTotal;
      units.set(key, entry);
    }
  }
  const topProducts = [...units.entries()]
    .map(([productId, v]) => ({ productId, name: v.name, unitsSold: v.units, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const sellableUnits = demoVariants.reduce((sum, v) => sum + v.onHand, 0);
  const inventoryValue = demoVariants.reduce((sum, v) => sum + v.onHand * v.cost, 0);
  const lowStock = demoVariants.filter((v) => v.onHand <= v.reorderLevel);

  return {
    range,
    salesTotal,
    transactions: sales.length,
    sellableUnits,
    lowStockCount: lowStock.length,
    inventoryValue,
    trend,
    topProducts,
    recentSales: demoSales.slice(0, 5).map((s) => ({
      id: s.id,
      receiptNumber: s.receiptNumber,
      total: s.total,
      paymentMethod: s.paymentMethods[0] ?? null,
      completedAt: s.completedAt,
      cashierName: s.cashierName,
    })),
    lowStock: lowStock.map((v) => ({
      variantId: v.id,
      productName: v.productName,
      label: v.label,
      sellable: v.onHand,
      reorderLevel: v.reorderLevel,
    })),
  };
}

export function salesReportFixture(range: string) {
  const sales = salesInRange(range);
  const grossSales = sales.reduce((sum, s) => sum + s.subtotal, 0);
  const discounts = sales.reduce((sum, s) => sum + s.discountTotal, 0);
  const refunds = demoReturns.reduce((sum, r) => sum + r.refundTotal, 0);
  const netSales = grossSales - discounts - refunds;
  const byDay = new Map<string, { total: number; transactions: number }>();
  for (const s of sales) {
    const key = dayKey(new Date(s.completedAt));
    const entry = byDay.get(key) ?? { total: 0, transactions: 0 };
    entry.total += s.total;
    entry.transactions += 1;
    byDay.set(key, entry);
  }
  const byPaymentMethodMap = new Map<string, number>();
  for (const s of sales) {
    const method = s.paymentMethods[0] ?? "cash";
    byPaymentMethodMap.set(method, (byPaymentMethodMap.get(method) ?? 0) + s.total);
  }
  return {
    range,
    grossSales,
    discounts,
    refunds,
    netSales,
    transactions: sales.length,
    averageBasket: sales.length ? Math.round(netSales / sales.length) : 0,
    byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
    byPaymentMethod: [...byPaymentMethodMap.entries()].map(([method, amount]) => ({ method, amount })),
  };
}

export function inventoryReportFixture() {
  const totalUnits = demoVariants.reduce((sum, v) => sum + v.onHand, 0);
  const inventoryValue = demoVariants.reduce((sum, v) => sum + v.onHand * v.cost, 0);
  const byCategory = new Map<string, { units: number; value: number }>();
  for (const v of demoVariants) {
    const entry = byCategory.get(v.category) ?? { units: 0, value: 0 };
    entry.units += v.onHand;
    entry.value += v.onHand * v.cost;
    byCategory.set(v.category, entry);
  }
  return {
    generatedAt: iso(new Date()),
    costingMethod: "moving_average",
    totalUnits,
    sellableUnits: totalUnits,
    reservedUnits: 0,
    damagedUnits: 0,
    quarantinedUnits: 0,
    activeSkus: demoVariants.length,
    inventoryValue,
    lowStock: demoVariants.filter((v) => v.onHand <= v.reorderLevel).map((v) => ({
      variantId: v.id,
      productName: v.productName,
      label: v.label,
      sku: v.sku,
      sellable: v.onHand,
      reorderLevel: v.reorderLevel,
    })),
    byCategory: [...byCategory.entries()].map(([category, v]) => ({ category, ...v })),
  };
}

export function pnlReportFixture(range: string) {
  const sales = salesInRange(range);
  const discounts = sales.reduce((sum, s) => sum + s.discountTotal, 0);
  const refunds = demoReturns.reduce((sum, r) => sum + r.refundTotal, 0);
  const netSales = sales.reduce((sum, s) => sum + s.total, 0) - refunds;
  const cogs = sales.reduce((sum, s) => sum + s.items.reduce((acc, i) => acc + i.unitCost * i.quantity, 0), 0);
  const grossProfit = netSales - cogs;
  const expensesRows = demoExpenses.filter((e) => new Date(e.expenseDate).getTime() >= rangeStart(range).getTime());
  const operatingExpenses = expensesRows.reduce((sum, e) => sum + e.amount, 0);
  const operatingProfit = grossProfit - operatingExpenses;
  return {
    range,
    netSales,
    discounts,
    refunds,
    transactions: sales.length,
    cogs,
    grossProfit,
    grossMargin: netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : 0,
    operatingExpenses,
    operatingProfit,
    note: "Demo figures — COGS at average cost, operating expenses from the demo ledger.",
  };
}

export function expensesReportFixture(range: string) {
  const rows = demoExpenses.filter((e) => new Date(e.expenseDate).getTime() >= rangeStart(range).getTime());
  const byCategory = new Map<string, { total: number; count: number }>();
  for (const e of rows) {
    const entry = byCategory.get(e.category) ?? { total: 0, count: 0 };
    entry.total += e.amount;
    entry.count += 1;
    byCategory.set(e.category, entry);
  }
  return {
    range,
    total: rows.reduce((sum, e) => sum + e.amount, 0),
    count: rows.length,
    byCategory: [...byCategory.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total - a.total),
  };
}

export function movementFixtureRows() {
  const rows: Array<Record<string, unknown>> = [];
  for (const s of demoSales) {
    for (const item of s.items) {
      const variant = demoVariants.find((v) => v.id === item.variantId)!;
      rows.push({
        id: `${s.id}-${item.sku}`,
        createdAt: s.completedAt,
        type: "SALE",
        productName: variant.productName,
        productId: variant.productId,
        label: variant.label,
        sku: variant.sku,
        onHandDelta: -item.quantity,
        reason: null,
        reference: s.receiptNumber,
        actor: s.cashierName,
      });
    }
  }
  rows.push({ id: "de000000-0000-4000-7000-100000000001", createdAt: iso(daysAgo(9, 10)), type: "STOCK_IN", productName: "Oversized Hoodie", productId: DEMO_ID(8007), label: "M / Grey", sku: "HOD-GRY-M", onHandDelta: 20, reason: "purchase", reference: "GRN-0007", actor: "Owner" });
  rows.push({ id: "de000000-0000-4000-7000-100000000002", createdAt: iso(daysAgo(9, 10)), type: "STOCK_IN", productName: "Zip Hoodie", productId: DEMO_ID(8008), label: "M / Black", sku: "ZIP-BLK-M", onHandDelta: 8, reason: "purchase", reference: "GRN-0007", actor: "Owner" });
  rows.push({ id: "de000000-0000-4000-7000-100000000003", createdAt: iso(daysAgo(6, 17)), type: "DAMAGE", productName: "Slim Stretch Jeans", productId: DEMO_ID(8003), label: "32 / Blue", sku: "JEN-BLU-32", onHandDelta: -1, reason: "damage", reference: "ADJ-0004", actor: "Diane Uwase" });
  rows.push({ id: "de000000-0000-4000-7000-100000000004", createdAt: iso(daysAgo(5, 12)), type: "ADJUSTMENT", productName: "Canvas Tote", productId: DEMO_ID(8012), label: "One size / Natural", sku: "TOT-NTL-OS", onHandDelta: 2, reason: "correction", reference: "ADJ-0003", actor: "Owner" });
  rows.push({ id: "de000000-0000-4000-7000-100000000005", createdAt: iso(daysAgo(2, 9)), type: "COUNT", productName: "Oxford Shirt", productId: DEMO_ID(8009), label: "L / White", sku: "OXF-WHT-L", onHandDelta: 0, reason: "stock_count", reference: "CNT-0002", actor: "Owner" });
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export const demoStockCountSessions = [
  { id: "de000000-0000-4000-7100-000000000002", createdAt: iso(daysAgo(2, 9)), scope: "Shirts", note: "Weekly count — Shirts", createdBy: "Owner", lines: 5, variances: 1 },
  { id: "de000000-0000-4000-7100-000000000001", createdAt: iso(daysAgo(16, 10)), scope: "all", note: "Monthly count — all", createdBy: "Owner", lines: 34, variances: 2 },
];

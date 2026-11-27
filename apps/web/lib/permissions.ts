// Client-side mirror of the server permission matrix (lib/server/permissions.ts).
// Used only for UI visibility (sidebar hiding). The API remains the enforcement
// boundary — every page is still enforced server-side.

export type Permission =
  | "dashboard"
  | "products.manage"
  | "categories.manage"
  | "stock.receive"
  | "movements.view"
  | "pos.sale"
  | "sales.view"
  | "reports.view"
  | "notifications"
  | "profile"
  | "staff.manage"
  | "settings.manage"
  | "audit.view"
  | "returns.process"
  | "adjustments.manage"
  | "counts.manage"
  | "expenses.manage"
  | "suppliers.manage"
  | "customers.manage";

const ALL: Permission[] = [
  "dashboard",
  "products.manage",
  "categories.manage",
  "stock.receive",
  "movements.view",
  "pos.sale",
  "sales.view",
  "reports.view",
  "notifications",
  "profile",
  "staff.manage",
  "settings.manage",
  "audit.view",
  "returns.process",
  "adjustments.manage",
  "counts.manage",
  "expenses.manage",
  "suppliers.manage",
  "customers.manage",
];

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: ALL,
  manager: [
    "dashboard",
    "products.manage",
    "categories.manage",
    "stock.receive",
    "movements.view",
    "pos.sale",
    "sales.view",
    "reports.view",
    "notifications",
    "profile",
    "returns.process",
    "adjustments.manage",
    "counts.manage",
    "expenses.manage",
    "suppliers.manage",
    "customers.manage",
  ],
  stock_clerk: [
    "dashboard",
    "products.manage",
    "categories.manage",
    "stock.receive",
    "movements.view",
    "notifications",
    "profile",
    "counts.manage",
  ],
  cashier: [
    "dashboard",
    "pos.sale",
    "sales.view",
    "notifications",
    "profile",
    "returns.process",
    "customers.manage",
  ],
};

export function roleCan(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

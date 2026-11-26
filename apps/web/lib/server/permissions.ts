// Server-side permission matrix (blueprint §17: Owner / Manager / Stock Clerk / Cashier).
// Hiding a button is UX; this is the enforcement boundary.

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
  | "audit.view";

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
  ],
  stock_clerk: [
    "dashboard",
    "products.manage",
    "categories.manage",
    "stock.receive",
    "movements.view",
    "notifications",
    "profile",
  ],
  cashier: ["dashboard", "pos.sale", "sales.view", "notifications", "profile"],
};

export function roleCan(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

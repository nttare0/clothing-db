"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboardIcon,
  ShirtIcon,
  PackagePlusIcon,
  ShoppingCartIcon,
  ArrowLeftRightIcon,
  Undo2Icon,
  SlidersHorizontalIcon,
  ClipboardCheckIcon,
  UsersIcon,
  TruckIcon,
  ReceiptIcon,
  BarChart3Icon,
  ShieldCheckIcon,
  ScrollTextIcon,
  SettingsIcon,
  CircleHelpIcon,
  TagsIcon,
  MenuIcon,
  XIcon,
  BellIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { roleCan, type Permission } from "@/lib/permissions";
import { useDemoActive, dismissDemo } from "@/lib/demo-state";
import { ThemeToggle } from "@/components/theme-toggle";
import { useOnline } from "@/lib/use-online";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  /** Permission required to SEE the item. Items the role lacks are hidden entirely. */
  permission?: Permission;
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon }],
  },
  {
    group: "Store operations",
    items: [
      { label: "Inventory", href: "/inventory", icon: ShirtIcon, permission: "movements.view" },
      { label: "Categories", href: "/categories", icon: TagsIcon, permission: "products.manage" },
      { label: "Stock In", href: "/stock-in", icon: PackagePlusIcon, permission: "stock.receive" },
      { label: "Sales / POS", href: "/pos", icon: ShoppingCartIcon, permission: "pos.sale" },
      { label: "Stock Movements", href: "/stock-movements", icon: ArrowLeftRightIcon, permission: "movements.view" },
      { label: "Returns", href: "/returns", icon: Undo2Icon, permission: "returns.process" },
      { label: "Adjustments", href: "/adjustments", icon: SlidersHorizontalIcon, permission: "adjustments.manage" },
      { label: "Stock Count", href: "/stock-count", icon: ClipboardCheckIcon, permission: "counts.manage" },
    ],
  },
  {
    group: "Relationships",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: TruckIcon, permission: "suppliers.manage" },
      { label: "Customers", href: "/customers", icon: UsersIcon, permission: "customers.manage" },
    ],
  },
  {
    group: "Business performance",
    items: [
      { label: "Expenses", href: "/expenses", icon: ReceiptIcon, permission: "expenses.manage" },
      { label: "Reports", href: "/reports", icon: BarChart3Icon, permission: "reports.view" },
    ],
  },
  {
    group: "Administration",
    items: [
      { label: "Staff & Permissions", href: "/staff", icon: ShieldCheckIcon, permission: "staff.manage" },
      { label: "Audit Logs", href: "/audit-logs", icon: ScrollTextIcon, permission: "audit.view" },
      { label: "Settings", href: "/settings", icon: SettingsIcon, permission: "settings.manage" },
      { label: "Help", href: "/help", icon: CircleHelpIcon },
    ],
  },
];

type Me = { name: string | null; email: string; role: string | null };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const demoOn = useDemoActive();
  // Close the mobile menu on navigation — state adjusted during render (React-endorsed pattern).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
    api<{ unread: number }>("/notifications/unread-count")
      .then((r) => setUnread(r.unread))
      .catch(() => setUnread(null));
  }, [pathname]);

  // While the role is unknown, keep skeleton-free but hide restricted links rather than flash them.
  const visibleNav = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || roleCan(me?.role, item.permission)),
  })).filter((section) => section.items.length > 0);

  const initials = (me?.name ?? me?.email ?? "S")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const nav = (
    <nav aria-label="Primary" className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2" aria-label="ClothFlow home">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShirtIcon className="size-5" aria-hidden />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-base font-semibold tracking-tight text-foreground">ClothFlow</span>
          <span className="text-[11px] text-muted-foreground">Store operations</span>
        </span>
      </Link>

      <div className="flex flex-col gap-5" aria-busy={me === null}>
        {me === null
          ? Array.from({ length: 3 }).map((_, gi) => (
              <div key={gi} className="flex flex-col gap-1.5" aria-hidden>
                <div className="mx-2 h-3 w-20 animate-pulse rounded bg-muted" />
                {Array.from({ length: 4 }).map((_, li) => (
                  <div key={li} className="h-9 animate-pulse rounded-lg bg-muted/70" />
                ))}
              </div>
            ))
          : visibleNav.map((section) => (
          <div key={section.group}>
            <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {section.group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = item.href ? pathname === item.href || pathname.startsWith(`${item.href}/`) : false;
                const Icon = item.icon;
                const content = (
                  <>
                    <Icon className="size-[18px] shrink-0 text-current" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </>
                );
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href!}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        active && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
                      )}
                    >
                      {content}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          ))}
      </div>

      <div className="mt-auto px-2 text-[11px] text-muted-foreground">
        RWF · Store currency
        <br />
        ClothFlow 1.0
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card print:hidden lg:block">
        <div className="sticky top-0 h-screen">{nav}</div>
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-3">
              <span className="text-sm font-semibold">Menu</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close menu">
                <XIcon />
              </Button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-5 print:hidden">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <MenuIcon />
          </Button>
          <p className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block">
            ClothFlow <span aria-hidden>·</span> Store workspace
          </p>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
              onClick={() => router.push("/notifications")}
            >
              <BellIcon />
              {unread && unread > 0 ? (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Button>

            <Link
              href="/profile"
              aria-label="Open your profile"
              title="Open your profile"
              className="flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="size-7">
                <AvatarFallback className="text-[11px] font-semibold">{initials || "S"}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-32 truncate md:inline">{me?.name ?? "Staff"}</span>
            </Link>
          </div>
        </header>

        {!online ? (
          <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 print:hidden">
            <WifiOffIcon className="size-4" aria-hidden />
            Connection lost. Sales and receipts need a live connection — nothing is sent until you retry.
          </div>
        ) : null}

        {demoOn ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2 text-xs text-primary md:px-6 print:hidden">
            <span>
              <strong>Demo mode.</strong> Sample products, stock and sales are shown so you can explore.
              They disappear automatically the moment you create your first product, receive stock, or ring up a sale.
            </span>
            <button
              type="button"
              className="shrink-0 font-semibold underline underline-offset-2 hover:text-primary/80"
              onClick={() => dismissDemo()}
            >
              Remove demo data now
            </button>
          </div>
        ) : null}

        <main className="min-w-0 flex-1" id="main-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

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
  ChevronDownIcon,
  LogOutIcon,
  UserIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/use-online";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  stage?: string; // set when the screen lands in a later build stage
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon }],
  },
  {
    group: "Store operations",
    items: [
      { label: "Inventory", href: "/inventory", icon: ShirtIcon },
      { label: "Categories", href: "/categories", icon: TagsIcon },
      { label: "Stock In", href: "/stock-in", icon: PackagePlusIcon },
      { label: "Sales / POS", href: "/pos", icon: ShoppingCartIcon },
      { label: "Stock Movements", href: "/stock-movements", icon: ArrowLeftRightIcon },
      { label: "Returns", icon: Undo2Icon, stage: "Stage 5" },
      { label: "Adjustments", icon: SlidersHorizontalIcon, stage: "Stage 5" },
      { label: "Stock Count", icon: ClipboardCheckIcon, stage: "Stage 5" },
    ],
  },
  {
    group: "Relationships",
    items: [
      { label: "Suppliers", icon: TruckIcon, stage: "Stage 6" },
      { label: "Customers", icon: UsersIcon, stage: "Stage 6" },
    ],
  },
  {
    group: "Business performance",
    items: [
      { label: "Expenses", icon: ReceiptIcon, stage: "Stage 6" },
      { label: "Reports", icon: BarChart3Icon, stage: "Stage 7" },
    ],
  },
  {
    group: "Administration",
    items: [
      { label: "Staff & Permissions", icon: ShieldCheckIcon, stage: "Stage 6" },
      { label: "Audit Logs", icon: ScrollTextIcon, stage: "Stage 6" },
      { label: "Settings", icon: SettingsIcon, stage: "Stage 6" },
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

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
    api<{ unread: number }>("/notifications/unread-count")
      .then((r) => setUnread(r.unread))
      .catch(() => setUnread(null));
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initials = (me?.name ?? me?.email ?? "S")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  async function signOut() {
    try {
      await api("/auth/signout", { method: "POST" });
    } catch {
      // sign-out is best-effort; leave the page either way
    }
    router.push("/signin");
    router.refresh();
  }

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

      <div className="flex flex-col gap-5">
        {NAV.map((section) => (
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
                    {item.stage ? (
                      <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground">
                        {item.stage}
                      </Badge>
                    ) : null}
                  </>
                );
                if (item.href) {
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
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
                }
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      disabled
                      aria-disabled
                      title="Planned for a later build stage"
                      className="flex h-9 w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-2 text-sm font-medium text-muted-foreground/60"
                    >
                      {content}
                    </button>
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

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[11px] font-semibold">{initials || "S"}</AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-32 truncate text-sm font-medium md:inline">
                      {me?.name ?? "Staff"}
                    </span>
                    <ChevronDownIcon className="hidden size-4 md:inline" aria-hidden />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block text-sm font-medium">{me?.name ?? "Staff account"}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {me?.email ?? "Sign-in required"}
                  </span>
                  {me?.role ? (
                    <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {me.role}
                    </span>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <UserIcon aria-hidden /> My profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} variant="destructive">
                  <LogOutIcon aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {!online ? (
          <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 print:hidden">
            <WifiOffIcon className="size-4" aria-hidden />
            Connection lost. Sales and receipts need a live connection — nothing is sent until you retry.
          </div>
        ) : null}

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

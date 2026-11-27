"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ShoppingCartIcon,
  PackagePlusIcon,
  TagIcon,
  BanknoteIcon,
  ReceiptIcon,
  PackageIcon,
  TriangleAlertIcon,
  VaultIcon,
} from "lucide-react";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorAlert, EmptyState } from "@/components/state";

type DashboardData = {
  range: string;
  salesTotal: number;
  transactions: number;
  sellableUnits: number;
  lowStockCount: number;
  inventoryValue: number;
  trend: { date: string; total: number }[];
  topProducts: { productId: string; name: string; unitsSold: number; revenue: number }[];
  recentSales: {
    id: string;
    receiptNumber: string;
    total: number;
    paymentMethod: string | null;
    completedAt: string;
    cashierName: string | null;
  }[];
  lowStock: {
    variantId: string;
    productName: string;
    label: string;
    sellable: number;
    reorderLevel: number;
  }[];
};

const RANGES = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
] as const;

export default function DashboardPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("today");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<DashboardData>(`/dashboard?range=${range}`)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load the dashboard. Check your internet connection and try again."),
      )
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = [
    { label: range === "today" ? "Today's sales" : "Sales", value: data ? formatRWF(data.salesTotal) : null, icon: BanknoteIcon },
    { label: "Transactions", value: data ? String(data.transactions) : null, icon: ReceiptIcon },
    { label: "Sellable units", value: data ? String(data.sellableUnits) : null, icon: PackageIcon },
    { label: "Low stock", value: data ? String(data.lowStockCount) : null, icon: TriangleAlertIcon, warn: true },
    { label: "Inventory value", value: data ? formatRWF(data.inventoryValue) : null, icon: VaultIcon },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">What the store needs right now — sales, stock and attention.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/pos" className={buttonVariants({ size: "sm" })}>
            <ShoppingCartIcon aria-hidden /> New sale
          </Link>
          <Link href="/stock-in/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <PackagePlusIcon aria-hidden /> Receive stock
          </Link>
          <Link href="/products/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <TagIcon aria-hidden /> Add product
          </Link>
        </div>
      </div>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="gap-2">
            <CardContent className="flex flex-col gap-1 pt-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                <kpi.icon className={`size-4 ${kpi.warn && data && data.lowStockCount > 0 ? "text-amber-600" : "text-muted-foreground"}`} aria-hidden />
              </div>
              {loading || kpi.value === null ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <p className="truncate text-lg font-semibold tracking-tight sm:text-xl">{kpi.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Sales trend</CardTitle>
            <CardDescription>Completed sales totals per day, store local time.</CardDescription>
          </div>
          <div role="tablist" aria-label="Date range" className="flex rounded-lg border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={range === r.id}
                onClick={() => setRange(r.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-36 w-full" />
          ) : data && data.trend.length > 0 ? (
            <TrendChart trend={data.trend} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No sales in this range yet.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Recent sales */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent sales</CardTitle>
            <Link href="/sales" className="text-sm font-medium text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : data && data.recentSales.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>
                        <Link href={`/sales/${sale.id}`} className="font-medium text-primary hover:underline">
                          {sale.receiptNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(sale.completedAt)}</TableCell>
                      <TableCell className="text-muted-foreground">{sale.paymentMethod ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatRWF(sale.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No sales yet"
                description="When the first sale is completed at the POS it will appear here."
                action={<Link href="/pos" className={buttonVariants({ size: "sm" })}>Open POS</Link>}
              />
            )}
          </CardContent>
        </Card>

        {/* Low stock */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Low stock</CardTitle>
            <Link href="/inventory?lowStock=1" className="text-sm font-medium text-primary hover:underline">Open inventory</Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : data && data.lowStock.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {data.lowStock.map((item) => (
                  <li key={item.variantId} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.productName}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.label}</p>
                    </div>
                    <Badge variant="warning" className="tabular-nums">
                      {item.sellable} left
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Stock levels look healthy"
                description="Variants at or below their reorder level will show up here."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TrendChart({ trend }: { trend: { date: string; total: number }[] }) {
  const width = 600;
  const height = 120;
  const max = Math.max(...trend.map((t) => t.total), 1);
  const step = trend.length > 1 ? width / (trend.length - 1) : width;
  const points = trend.map((t, i) => `${i * step},${height - (t.total / max) * (height - 12) - 4}`);
  const path = points.join(" ");

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full" role="img" aria-label="Sales trend">
        <title>Sales trend</title>
        <polyline
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={path}
        />
      </svg>
      {/* Accessible tabular alternative for screen readers */}
      <table className="sr-only">
        <caption>Sales totals per day</caption>
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Total</th></tr>
        </thead>
        <tbody>
          {trend.map((t) => (
            <tr key={t.date}><td>{t.date}</td><td>{t.total}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{trend[0]?.date}</span>
        <span>{trend[trend.length - 1]?.date}</span>
      </div>
    </div>
  );
}

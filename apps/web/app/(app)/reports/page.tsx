"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3Icon,
  TrendingUpIcon,
  PackageIcon,
  LineChartIcon,
  WalletIcon,
  ArrowRightIcon,
} from "lucide-react";
import { api, ApiError, formatRWF } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert, EmptyState } from "@/components/state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";

type Range = "today" | "7d" | "30d" | "custom";

type SalesReport = {
  range: string;
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  transactions: number;
  averageBasket: number;
  byDay: { date: string; total: number; transactions: number }[];
  byPaymentMethod: { method: string; amount: number }[];
};

type InventoryReport = {
  generatedAt: string;
  costingMethod: string;
  totalUnits: number;
  sellableUnits: number;
  reservedUnits: number;
  damagedUnits: number;
  quarantinedUnits: number;
  activeSkus: number;
  inventoryValue: number;
  lowStock: { variantId: string; productName: string; label: string; sku: string; sellable: number; reorderLevel: number }[];
  byCategory: { category: string; units: number; value: number }[];
};

type PnlReport = {
  range: string;
  netSales: number;
  discounts: number;
  refunds: number;
  transactions: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  operatingProfit: number;
  note: string;
};

type ExpensesReport = {
  range: string;
  total: number;
  count: number;
  byCategory: { category: string; total: number; count: number }[];
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  card: "Card",
  bank_transfer: "Bank transfer",
  store_credit: "Store credit",
};

function useReport<T>(path: string, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<T>(path)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load the report. Check your internet connection and try again."),
      )
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { data, error, loading, reload: load };
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums sm:text-xl">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function ReportsPage() {
  const [range, setRange] = useState<Range>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState("sales");

  const query = range === "custom" && from && to
    ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    : `range=${range}`;

  const sales = useReport<SalesReport>(`/reports/sales?${query}`, tab === "sales");
  const inventory = useReport<InventoryReport>("/reports/inventory", tab === "inventory");
  const pnl = useReport<PnlReport>(`/reports/pnl?${query}`, tab === "pnl");
  const expenses = useReport<ExpensesReport>(`/reports/expenses?${query}`, tab === "expenses");

  const maxDay = Math.max(1, ...(sales.data?.byDay ?? []).map((d) => d.total));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl"><BarChart3Icon className="size-6" aria-hidden /> Reports</h1>
          <p className="text-sm text-muted-foreground">Management view — sales, inventory, margins and costs.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Range" className="w-40" value={range} onChange={(e) => setRange(e.target.value as Range)}>
            <NativeSelectOption value="today">Today</NativeSelectOption>
            <NativeSelectOption value="7d">Last 7 days</NativeSelectOption>
            <NativeSelectOption value="30d">Last 30 days</NativeSelectOption>
            <NativeSelectOption value="custom">Custom…</NativeSelectOption>
          </NativeSelect>
          {range === "custom" ? (
            <>
              <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          ) : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="sales"><TrendingUpIcon className="size-4" aria-hidden /> Sales</TabsTrigger>
          <TabsTrigger value="inventory"><PackageIcon className="size-4" aria-hidden /> Inventory</TabsTrigger>
          <TabsTrigger value="pnl"><LineChartIcon className="size-4" aria-hidden /> P&amp;L</TabsTrigger>
          <TabsTrigger value="expenses"><WalletIcon className="size-4" aria-hidden /> Expenses</TabsTrigger>
        </TabsList>

        {/* ---- Sales ---- */}
        <TabsContent value="sales" className="flex flex-col gap-4">
          {sales.error ? <ErrorAlert message={sales.error} onRetry={sales.reload} /> : null}
          {sales.loading || !sales.data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Net sales" value={formatRWF(sales.data.netSales)} hint={`${sales.data.transactions} receipts`} />
                <Stat label="Gross (before discount)" value={formatRWF(sales.data.grossSales)} />
                <Stat label="Refunds" value={formatRWF(sales.data.refunds)} hint={`Discounts ${formatRWF(sales.data.discounts)}`} />
                <Stat label="Average basket" value={formatRWF(sales.data.averageBasket)} />
              </div>
              <Card>
                <CardHeader><CardTitle>Sales by day</CardTitle><CardDescription>{sales.data.range}</CardDescription></CardHeader>
                <CardContent>
                  {sales.data.byDay.length === 0 ? (
                    <EmptyState title="No sales in range" description="Completed sales will appear here." />
                  ) : (
                    <div className="flex h-44 items-end gap-1 overflow-x-auto pb-1" role="img" aria-label="Daily sales bar chart">
                      {sales.data.byDay.map((d) => (
                        <div key={d.date} className="group flex h-full min-w-6 flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${formatRWF(d.total)} (${d.transactions})`}>
                          <div className="w-full rounded-t bg-primary/70 transition group-hover:bg-primary" style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%` }} />
                          <span className="text-[9px] text-muted-foreground">{d.date.slice(5)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="p-0">
                <CardHeader className="p-4 pb-2"><CardTitle>Payment methods</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow><TableHead className="pl-4">Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="pr-4 text-right">Share</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {sales.data.byPaymentMethod.map((m) => {
                        const total = sales.data!.byPaymentMethod.reduce((s, x) => s + x.amount, 0);
                        return (
                          <TableRow key={m.method}>
                            <TableCell className="pl-4 font-medium">{METHOD_LABELS[m.method] ?? m.method}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatRWF(m.amount)}</TableCell>
                            <TableCell className="pr-4 text-right tabular-nums text-muted-foreground">{total > 0 ? `${Math.round((m.amount / total) * 100)}%` : "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ---- Inventory ---- */}
        <TabsContent value="inventory" className="flex flex-col gap-4">
          {inventory.error ? <ErrorAlert message={inventory.error} onRetry={inventory.reload} /> : null}
          {inventory.loading || !inventory.data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Inventory value" value={formatRWF(inventory.data.inventoryValue)} hint={`${inventory.data.costingMethod.replace("_", " ")} costing`} />
                <Stat label="Active SKUs" value={String(inventory.data.activeSkus)} />
                <Stat label="Sellable units" value={String(inventory.data.sellableUnits)} hint={`${inventory.data.totalUnits} on hand`} />
                <Stat label="Damaged / quarantine" value={`${inventory.data.damagedUnits} / ${inventory.data.quarantinedUnits}`} hint={`${inventory.data.reservedUnits} reserved`} />
              </div>
              <Card className="p-0">
                <CardHeader className="p-4 pb-2">
                  <CardTitle>Low stock</CardTitle>
                  <CardDescription>Sellable at or below reorder level — reorder soon.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {inventory.data.lowStock.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Nothing below reorder level. Nice.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead className="pl-4">Variant</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Sellable</TableHead><TableHead className="pr-4 text-right">Reorder at</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {inventory.data.lowStock.map((v) => (
                          <TableRow key={v.variantId}>
                            <TableCell className="pl-4">
                              <p className="text-sm font-medium">{v.productName} · {v.label}</p>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-destructive">{v.sellable}</TableCell>
                            <TableCell className="pr-4 text-right tabular-nums">{v.reorderLevel}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
              <Card className="p-0">
                <CardHeader className="p-4 pb-2"><CardTitle>Value by category</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow><TableHead className="pl-4">Category</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="pr-4 text-right">Value</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {inventory.data.byCategory.map((c) => (
                        <TableRow key={c.category}>
                          <TableCell className="pl-4 font-medium">{c.category}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.units}</TableCell>
                          <TableCell className="pr-4 text-right tabular-nums">{formatRWF(c.value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ---- P&L ---- */}
        <TabsContent value="pnl" className="flex flex-col gap-4">
          {pnl.error ? <ErrorAlert message={pnl.error} onRetry={pnl.reload} /> : null}
          {pnl.loading || !pnl.data ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <Card>
              <CardHeader><CardTitle>Management P&amp;L</CardTitle><CardDescription>{pnl.data.range} · {pnl.data.transactions} receipts</CardDescription></CardHeader>
              <CardContent>
                <div className="flex flex-col text-sm">
                  {[
                    { label: "Net sales (after discounts)", value: pnl.data.netSales, strong: true },
                    { label: "Cost of goods sold", value: -pnl.data.cogs },
                    { label: "Gross profit", value: pnl.data.grossProfit, strong: true },
                    { label: `Gross margin`, text: `${pnl.data.grossMargin.toFixed(1)}%` },
                    { label: "Operating expenses", value: -pnl.data.operatingExpenses },
                    { label: "Operating profit", value: pnl.data.operatingProfit, strong: true },
                  ].map((row, i) => (
                    <div key={i} className={`flex items-baseline justify-between border-b border-border/60 py-2.5 last:border-0 ${row.strong ? "font-semibold" : "text-muted-foreground"}`}>
                      <span>{row.label}</span>
                      <span className="tabular-nums">{row.text ?? formatRWF(row.value ?? 0)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">{pnl.data.note}</p>
                <Link href="/expenses" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">See expense detail <ArrowRightIcon className="size-4" aria-hidden /></Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---- Expenses ---- */}
        <TabsContent value="expenses" className="flex flex-col gap-4">
          {expenses.error ? <ErrorAlert message={expenses.error} onRetry={expenses.reload} /> : null}
          {expenses.loading || !expenses.data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total expenses" value={formatRWF(expenses.data.total)} hint={`${expenses.data.count} entries · ${expenses.data.range}`} />
                <Stat label="Avg per entry" value={formatRWF(expenses.data.count > 0 ? expenses.data.total / expenses.data.count : 0)} />
              </div>
              <Card className="p-0">
                <CardHeader className="p-4 pb-2"><CardTitle>By category</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {expenses.data.byCategory.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No expenses in this range.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead className="pl-4">Category</TableHead><TableHead className="text-right">Entries</TableHead><TableHead className="pr-4 text-right">Total</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {expenses.data.byCategory.map((c) => (
                          <TableRow key={c.category}>
                            <TableCell className="pl-4 font-medium">{c.category}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                            <TableCell className="pr-4 text-right tabular-nums">{formatRWF(c.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SearchIcon, ReceiptIcon } from "lucide-react";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorAlert, EmptyState } from "@/components/state";

type SaleRow = {
  id: string;
  receiptNumber: string;
  completedAt: string;
  cashierName: string | null;
  total: number;
  paymentMethods: string[];
  returnStatus: "none" | "partial" | "full";
};

const PAGE_SIZE = 20;

export default function SalesHistoryPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (query.trim()) q.set("search", query.trim());
    if (status !== "all") q.set("status", status);
    q.set("page", String(page));
    q.set("pageSize", String(PAGE_SIZE));
    api<{ items: SaleRow[]; total: number }>(`/sales?${q.toString()}`)
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Could not load sales."),
      )
      .finally(() => setLoading(false));
  }, [query, status, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Sales history</h1>
        <p className="text-sm text-muted-foreground">Find any receipt by number, cashier activity or date.</p>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search by receipt number"
            placeholder="Search receipt number…"
            className="pl-9"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
        </div>
        <NativeSelect
          aria-label="Filter by return status"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <NativeSelectOption value="all">All sales</NativeSelectOption>
          <NativeSelectOption value="completed">Completed</NativeSelectOption>
          <NativeSelectOption value="returned">Has returns</NativeSelectOption>
        </NativeSelect>
      </div>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {loading ? (
        <Card><CardContent className="flex flex-col gap-2 pt-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</CardContent></Card>
      ) : rows && rows.length === 0 ? (
        <EmptyState
          title={query ? "No matching receipts" : "No sales yet"}
          description={query ? "Check the receipt number and try again." : "Completed sales will appear here."}
        />
      ) : rows ? (
        <>
          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date &amp; time</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Returns</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <Link href={`/sales/${sale.id}`} className="flex items-center gap-2 font-medium text-primary hover:underline">
                        <ReceiptIcon className="size-4" aria-hidden /> {sale.receiptNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(sale.completedAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{sale.cashierName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{sale.paymentMethods.join(", ") || "—"}</TableCell>
                    <TableCell>
                      {sale.returnStatus === "none" ? <span className="text-xs text-muted-foreground">—</span>
                        : <Badge variant={sale.returnStatus === "full" ? "destructive" : "warning"}>{sale.returnStatus}</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatRWF(sale.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((sale) => (
              <li key={sale.id}>
                <Link href={`/sales/${sale.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                  <span>
                    <span className="block text-sm font-medium">{sale.receiptNumber}</span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(sale.completedAt)} · {sale.paymentMethods.join(", ") || "—"}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {sale.returnStatus !== "none" ? <Badge variant={sale.returnStatus === "full" ? "destructive" : "warning"}>{sale.returnStatus}</Badge> : null}
                    <span className="text-sm font-semibold tabular-nums">{formatRWF(sale.total)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p aria-live="polite">{total} sale{total === 1 ? "" : "s"} · page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

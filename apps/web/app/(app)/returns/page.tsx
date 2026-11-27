"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SearchIcon, Undo2Icon } from "lucide-react";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

type ReturnRow = {
  id: string;
  createdAt: string;
  receiptNumber: string;
  saleId: string;
  refundMethod: string | null;
  refundTotal: number;
  items: number;
  reason: string;
  processedBy: string | null;
};

const PAGE_SIZE = 20;

const REASON_LABELS: Record<string, string> = {
  customer_return: "Customer return",
  wrong_size: "Wrong size",
  defect: "Defect",
  wrong_item: "Wrong item",
  other: "Other",
};

export default function ReturnsPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ReturnRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query.trim()) q.set("search", query.trim());
    api<{ items: ReturnRow[]; total: number }>(`/returns?${q.toString()}`)
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Could not load returns."),
      )
      .finally(() => setLoading(false));
  }, [query, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Returns & refunds</h1>
          <p className="text-sm text-muted-foreground">Returns are processed against the original receipt — start from Sales history.</p>
        </div>
        <Link href="/sales" className={buttonVariants()}>
          <Undo2Icon aria-hidden /> Start from a sale
        </Link>
      </div>

      <div className="relative">
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

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {loading ? (
        <Card><CardContent className="flex flex-col gap-2 pt-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</CardContent></Card>
      ) : rows && rows.length === 0 ? (
        <EmptyState
          title="No returns yet"
          description="When a customer brings something back, open the original sale and choose Start return."
          action={<Link href="/sales" className={buttonVariants()}><Undo2Icon aria-hidden /> Find a sale</Link>}
        />
      ) : rows ? (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Refund</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Processed by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="pl-4 text-sm text-muted-foreground">{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell>
                    <Link href={`/sales/${row.saleId}`} className="font-mono font-medium text-primary hover:underline">
                      <span className="break-all">{row.receiptNumber}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.items}</TableCell>
                  <TableCell>
                    <span className="font-medium tabular-nums">{formatRWF(row.refundTotal)}</span>
                    {row.refundMethod ? <Badge variant="outline" className="ml-2 text-[10px] uppercase">{row.refundMethod.replace("_", " ")}</Badge> : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{REASON_LABELS[row.reason] ?? row.reason}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.processedBy ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-border p-3 text-sm">
              <span className="text-muted-foreground">{total} return{total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2">
                <button className="rounded-md border border-border px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <span className="tabular-nums text-muted-foreground">{page} / {totalPages}</span>
                <button className="rounded-md border border-border px-2 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

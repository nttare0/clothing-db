"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PackagePlusIcon, ReceiptTextIcon } from "lucide-react";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { SearchInput } from "@/components/search-input";

type ReceiptRow = {
  id: string;
  reference: string | null;
  reason: string;
  receivedAt: string;
  receivedBy: string | null;
  itemCount: number;
  totalCost: number | null;
};

const PAGE_SIZE = 20;

export default function StockInListPage() {
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ReceiptRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (query.trim()) q.set("search", query.trim());
    if (reason !== "all") q.set("reason", reason);
    q.set("page", String(page));
    q.set("pageSize", String(PAGE_SIZE));
    api<{ items: ReceiptRow[]; total: number }>(`/stock-in?${q.toString()}`)
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load the stock receipts. Check your internet connection and try again."),
      )
      .finally(() => setLoading(false));
  }, [query, reason, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Stock in</h1>
          <p className="text-sm text-muted-foreground">Every quantity that entered the store, with its source.</p>
        </div>
        <Link href="/stock-in/new" className={buttonVariants({ size: "lg" })}>
          <PackagePlusIcon aria-hidden /> Receive stock
        </Link>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchInput
          className="flex-1"
          ariaLabel="Search by reference"
          placeholder="Search reference / GRN…"
          value={query}
          onChange={(v) => { setQuery(v); setPage(1); }}
        />
        <NativeSelect
          aria-label="Filter by reason"
          value={reason}
          onChange={(e) => { setReason(e.target.value); setPage(1); }}
        >
          <NativeSelectOption value="all">All reasons</NativeSelectOption>
          <NativeSelectOption value="opening_stock">Opening stock</NativeSelectOption>
          <NativeSelectOption value="purchase">Purchase</NativeSelectOption>
          <NativeSelectOption value="return_from_customer">Customer return</NativeSelectOption>
          <NativeSelectOption value="correction">Correction</NativeSelectOption>
          <NativeSelectOption value="transfer_in">Transfer in</NativeSelectOption>
        </NativeSelect>
      </div>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {loading ? (
        <Card><CardContent className="flex flex-col gap-2 pt-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</CardContent></Card>
      ) : rows && rows.length === 0 ? (
        <EmptyState
          title="No receipts yet"
          description="Receiving stock is the only way quantities enter the store. Record your opening balance first."
          action={<Link href="/stock-in/new" className={buttonVariants()}><PackagePlusIcon aria-hidden /> Receive stock</Link>}
        />
      ) : rows ? (
        <>
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                  <TableHead>Received by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground">{formatDateTime(row.receivedAt)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <ReceiptTextIcon className="size-4 text-muted-foreground" aria-hidden />
                        <span className="break-all">{row.reference ?? row.id.slice(0, 8)}</span>
                      </span>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{row.reason.replaceAll("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{row.itemCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.totalCost == null ? "—" : formatRWF(row.totalCost)}</TableCell>
                    <TableCell className="text-muted-foreground">{row.receivedBy ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p aria-live="polite">{total} receipt{total === 1 ? "" : "s"} · page {page} of {totalPages}</p>
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

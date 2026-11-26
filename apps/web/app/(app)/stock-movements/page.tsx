"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRightIcon, SearchIcon } from "lucide-react";
import { api, ApiError, formatDateTime } from "@/lib/api";
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

type MovementRow = {
  id: string;
  createdAt: string;
  type: string;
  productName: string;
  productId: string;
  label: string;
  sku: string;
  onHandDelta: number;
  reason: string | null;
  reference: string | null;
  actor: string | null;
};

const PAGE_SIZE = 30;

const TYPE_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  SALE: "destructive",
  STOCK_IN: "success",
  RETURN: "success",
  ADJUSTMENT: "warning",
  COUNT: "secondary",
};

function StockMovementsView() {
  const params = useSearchParams();
  const productId = params.get("productId") ?? "";
  const reference = params.get("reference") ?? "";

  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<MovementRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (productId) q.set("productId", productId);
    if (reference) q.set("reference", reference);
    if (query.trim()) q.set("search", query.trim());
    if (type !== "all") q.set("type", type);
    q.set("page", String(page));
    q.set("pageSize", String(PAGE_SIZE));
    api<{ items: MovementRow[]; total: number }>(`/stock-movements?${q.toString()}`)
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Could not load movements."),
      )
      .finally(() => setLoading(false));
  }, [productId, reference, query, type, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const scoped = productId || reference;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Stock movements</h1>
        <p className="text-sm text-muted-foreground">
          Immutable ledger of every quantity change. {scoped ? "Filtered view — " : ""}{""}
          {productId ? <Link href="/stock-movements" className="text-primary hover:underline">clear product filter</Link> : null}
          {productId && reference ? " · " : ""}
          {reference ? <Link href="/stock-movements" className="text-primary hover:underline">clear reference filter</Link> : null}
        </p>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search movements"
            placeholder="Search product, SKU or reference…"
            className="pl-9"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
        </div>
        <NativeSelect
          aria-label="Filter by movement type"
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
        >
          <NativeSelectOption value="all">All types</NativeSelectOption>
          <NativeSelectOption value="STOCK_IN">Stock in</NativeSelectOption>
          <NativeSelectOption value="SALE">Sale</NativeSelectOption>
          <NativeSelectOption value="RETURN">Return</NativeSelectOption>
          <NativeSelectOption value="ADJUSTMENT">Adjustment</NativeSelectOption>
          <NativeSelectOption value="COUNT">Stock count</NativeSelectOption>
          <NativeSelectOption value="DAMAGE">Damage</NativeSelectOption>
        </NativeSelect>
      </div>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {loading ? (
        <Card><CardContent className="flex flex-col gap-2 pt-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</CardContent></Card>
      ) : rows && rows.length === 0 ? (
        <EmptyState
          title="No movements yet"
          description="Receiving stock or completing a sale will create the first ledger entries."
        />
      ) : rows ? (
        <>
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(m.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={TYPE_VARIANT[m.type] ?? "secondary"}>{m.type.replaceAll("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/products/${m.productId}`} className="font-medium hover:underline">
                        {m.productName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{m.label} · {m.sku}</span>
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${m.onHandDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {m.onHandDelta >= 0 ? "+" : ""}{m.onHandDelta}
                    </TableCell>
                    <TableCell className="max-w-36 truncate text-muted-foreground">{m.reference ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.actor ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p aria-live="polite">{total} entr{total === 1 ? "y" : "ies"} · page {page} of {totalPages}</p>
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

export default function StockMovementsPage() {
  return (
    <Suspense fallback={null}>
      <StockMovementsView />
    </Suspense>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PlusIcon, ShirtIcon } from "lucide-react";
import { api, ApiError, formatRWF } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
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

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  status: string;
  variantCount: number;
  totalSellable: number;
  minPrice: number | null;
  lowStock: boolean;
};

type ProductList = {
  items: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
};

type Category = { id: string; name: string };

const PAGE_SIZE = 20;

function InventoryView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const search = params.get("search") ?? "";
  const categoryId = params.get("category") ?? "";
  const status = params.get("status") ?? "active";
  const lowStock = params.get("lowStock") === "1";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const [searchDraft, setSearchDraft] = useState(search);
  const [items, setItems] = useState<ProductRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSearchDraft(search), [search]);

  useEffect(() => {
    api<{ items: Category[] }>("/categories")
      .then((r) => setCategories(r.items))
      .catch(() => setCategories([]));
  }, []);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in updates)) next.delete("page");
      router.replace(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (categoryId) q.set("categoryId", categoryId);
    if (status) q.set("status", status);
    if (lowStock) q.set("lowStock", "1");
    q.set("page", String(page));
    q.set("pageSize", String(PAGE_SIZE));
    api<ProductList>(`/products?${q.toString()}`)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load the products. Check your internet connection and try again."),
      )
      .finally(() => setLoading(false));
  }, [search, categoryId, status, lowStock, page]);

  useEffect(() => {
    load();
  }, [load]);

  function onSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateParams({ search: searchDraft.trim() || null });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Inventory</h1>
          <p className="text-sm text-muted-foreground">Every product and variant, with sellable stock at a glance.</p>
        </div>
        <Link href="/products/new" className={buttonVariants({ size: "sm" })}>
          <PlusIcon aria-hidden /> Add product
        </Link>
      </div>

      {/* Filters */}
      <form onSubmit={onSearchSubmit} className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchInput
          className="flex-1"
          ariaLabel="Search products by name, SKU or barcode"
          placeholder="Search name, SKU or barcode…"
          value={searchDraft}
          onChange={setSearchDraft}
        />
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label="Filter by category"
            value={categoryId}
            onChange={(e) => updateParams({ category: e.target.value || null })}
          >
            <NativeSelectOption value="">All categories</NativeSelectOption>
            {categories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by status"
            value={status}
            onChange={(e) => updateParams({ status: e.target.value })}
          >
            <NativeSelectOption value="active">Active</NativeSelectOption>
            <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
            <NativeSelectOption value="archived">Archived</NativeSelectOption>
          </NativeSelect>
          <Button
            type="button"
            variant={lowStock ? "default" : "outline"}
            size="sm"
            aria-pressed={lowStock}
            onClick={() => updateParams({ lowStock: lowStock ? null : "1" })}
            className="h-8"
          >
            Low stock
          </Button>
          <Button type="submit" size="sm" className="h-8">Search</Button>
        </div>
      </form>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {/* Results */}
      {loading ? (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-2">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
          </CardContent>
        </Card>
      ) : items && items.length === 0 ? (
        search || categoryId || lowStock ? (
          <EmptyState
            title="No matches"
            description="No products match those filters. Clear the search or filters and try again."
            action={
              <Button variant="outline" size="sm" onClick={() => router.replace(pathname)}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No products yet"
            description="Add your first product with its size and colour variants. Stock is established later via Stock In."
            action={<Link href="/products/new" className={buttonVariants({ size: "sm" })}><PlusIcon aria-hidden /> Add product</Link>}
          />
        )
      ) : items ? (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Variants</TableHead>
                  <TableHead className="text-right">Sellable</TableHead>
                  <TableHead className="text-right">Price from</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/products/${p.id}`} className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <ShirtIcon className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-primary hover:underline">{p.name}</span>
                          {p.brand ? <span className="block truncate text-xs text-muted-foreground">{p.brand}</span> : null}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.variantCount}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.totalSellable === 0 ? "destructive" : p.lowStock ? "warning" : "success"} className="tabular-nums">
                        {p.totalSellable}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.minPrice != null ? formatRWF(p.minPrice) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "outline" : "secondary"}>{p.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {items.map((p) => (
              <li key={p.id}>
                <Link href={`/products/${p.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 active:bg-muted">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <ShirtIcon className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[p.category, p.brand].filter(Boolean).join(" · ") || "—"} · {p.variantCount} variants
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-xs">
                      <Badge variant={p.totalSellable === 0 ? "destructive" : p.lowStock ? "warning" : "success"} className="tabular-nums">
                        {p.totalSellable} in stock
                      </Badge>
                      {p.minPrice != null ? <span className="tabular-nums text-muted-foreground">from {formatRWF(p.minPrice)}</span> : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p aria-live="polite">
              {total} product{total === 1 ? "" : "s"} · page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => updateParams({ page: String(page + 1) })}>
                Next
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <InventoryView />
    </Suspense>
  );
}

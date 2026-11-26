"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ShirtIcon, PencilIcon, PackagePlusIcon, HistoryIcon, ArchiveIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ErrorAlert } from "@/components/state";

type ProductDetail = {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  category: string | null;
  status: string;
  createdAt: string;
  variants: {
    id: string;
    sku: string;
    barcode: string | null;
    size: string;
    colour: string | null;
    sellingPrice: string | number | null;
    movingAverageCost: string | number | null;
    onHand: number;
    sellable: number;
    damaged: number;
    reorderLevel: number;
  }[];
};

type Movement = {
  id: string;
  createdAt: string;
  type: string;
  onHandDelta: number;
  reason: string | null;
  reference: string | null;
  actor: string | null;
};

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api<ProductDetail>(`/products/${params.id}`),
      api<{ items: Movement[] }>(`/stock-movements?productId=${params.id}&limit=10`).catch(() => ({ items: [] as Movement[] })),
    ])
      .then(([p, m]) => {
        setProduct(p);
        setMovements(m.items);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Could not load the product."),
      )
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function deactivate() {
    setDeactivating(true);
    try {
      await api(`/products/${params.id}/deactivate`, { method: "POST" });
      toast.success("Product deactivated");
      router.refresh();
      load();
    } catch (err) {
      toast.error("Could not deactivate", {
        description: err instanceof ApiError ? err.message : "Try again.",
      });
    } finally {
      setDeactivating(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ErrorAlert message={error} onRetry={load} />
      </div>
    );
  }

  if (loading || !product) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const archived = product.status !== "active";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <ShirtIcon className="size-8" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{product.name}</h1>
              <Badge variant={archived ? "secondary" : "success"}>{product.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {[product.category, product.brand].filter(Boolean).join(" · ") || "Uncategorised"}
            </p>
            {product.description ? <p className="mt-2 max-w-prose text-sm">{product.description}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/stock-in/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <PackagePlusIcon aria-hidden /> Receive stock
          </Link>
          <Link href={`/products/${product.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <PencilIcon aria-hidden /> Edit
          </Link>
          {!archived ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="outline" size="sm" className="text-destructive">
                    <ArchiveIcon aria-hidden /> Deactivate
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deactivate {product.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It will no longer be searchable at the POS. History, receipts and movements are kept. You can reactivate it later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep active</AlertDialogCancel>
                  <AlertDialogAction onClick={deactivate} disabled={deactivating}>
                    {deactivating ? "Deactivating…" : "Deactivate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      {/* Variants */}
      <Card className="overflow-hidden p-0">
        <CardHeader className="px-4 pt-4">
          <CardTitle>Variants &amp; stock</CardTitle>
          <CardDescription>Sellable = on hand − reserved − damaged − quarantined.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Colour</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Avg cost</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Sellable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.sku}</TableCell>
                    <TableCell>{v.size}</TableCell>
                    <TableCell>{v.colour ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.sellingPrice == null ? "—" : formatRWF(Number(v.sellingPrice))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {v.movingAverageCost == null ? "—" : formatRWF(Number(v.movingAverageCost))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{v.onHand}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={v.sellable === 0 ? "destructive" : v.sellable <= v.reorderLevel ? "warning" : "success"} className="tabular-nums">
                        {v.sellable}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent movements */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><HistoryIcon className="size-4" aria-hidden /> Recent movements</CardTitle>
            <CardDescription>Last 10 ledger entries for this product.</CardDescription>
          </div>
          <Link href={`/stock-movements?productId=${product.id}`} className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No movements yet. Receiving stock or a sale will create the first entries.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Δ on hand</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground">{formatDateTime(m.createdAt)}</TableCell>
                    <TableCell>{m.type.replaceAll("_", " ")}</TableCell>
                    <TableCell className={`tabular-nums ${m.onHandDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {m.onHandDelta >= 0 ? "+" : ""}{m.onHandDelta}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.reference ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.actor ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

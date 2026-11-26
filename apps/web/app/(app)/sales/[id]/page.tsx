"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PrinterIcon, ArrowLeftIcon, ReceiptIcon, Undo2Icon } from "lucide-react";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorAlert } from "@/components/state";

type StoreInfo = {
  store_name?: string;
  store_address?: string;
  store_phone?: string;
  receipt_footer?: string;
};

type SaleDetail = {
  id: string;
  receiptNumber: string;
  completedAt: string;
  cashierName: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  changeDue: number;
  customerPhone: string | null;
  items: {
    id: string;
    productId: string;
    label: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  payments: { method: string; amount: number; reference: string | null }[];
  changeLines?: { method: string; amount: number }[];
};

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [store, setStore] = useState<StoreInfo>({});
  const [canReturn, setCanReturn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<SaleDetail>(`/sales/${params.id}`)
      .then(setSale)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load the sale."))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    api<StoreInfo>("/settings").then(setStore).catch(() => setStore({}));
    api<{ role?: string }>("/auth/me")
      .then((m) => setCanReturn(["owner", "manager", "cashier"].includes(m.role ?? "")))
      .catch(() => setCanReturn(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link href="/sales" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground print:hidden">
          <ArrowLeftIcon className="size-4" aria-hidden /> Back to sales
        </Link>
        <ErrorAlert message={error} onRetry={load} />
      </div>
    );
  }

  if (loading || !sale) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const totalQty = sale.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="receipt-page mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pt-6 sm:p-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/sales" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden /> Sales
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="success">Completed</Badge>
          {canReturn ? (
            <Link href={`/returns/new?sale=${sale.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium hover:bg-muted">
              <Undo2Icon className="size-4" aria-hidden /> Start return
            </Link>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <PrinterIcon aria-hidden /> Reprint
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 pt-2 font-mono">
          {/* Receipt header */}
          <div className="flex flex-col items-center gap-1 border-b border-dashed border-border pb-4 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground print:hidden">
              <ReceiptIcon className="size-5" aria-hidden />
            </span>
            <p className="text-lg font-bold">{store.store_name ?? "ClothFlow Store"}</p>
            {store.store_address ? <p className="text-[10px]">{store.store_address}</p> : null}
            {store.store_phone ? <p className="text-[10px]">{store.store_phone}</p> : null}
            <p className="text-xs">Receipt #{sale.receiptNumber}</p>
            <p className="text-xs">{formatDateTime(sale.completedAt)}</p>
            {sale.cashierName ? <p className="text-xs">Served by {sale.cashierName}</p> : null}
            {sale.customerPhone ? <p className="text-xs">Customer: {sale.customerPhone}</p> : null}
          </div>

          {/* Items */}
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase">Item</TableHead>
                <TableHead className="text-right text-[10px] uppercase">Qty</TableHead>
                <TableHead className="text-right text-[10px] uppercase">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="py-1">
                    <span className="block font-semibold">{item.label}</span>
                    <Link href={`/products/${item.productId}`} className="text-[10px] text-muted-foreground print:no-underline hover:underline">
                      {item.sku}
                    </Link>
                  </TableCell>
                  <TableCell className="py-1 text-right tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="py-1 text-right tabular-nums">{formatRWF(item.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Totals */}
          <div className="flex flex-col gap-1 border-t border-dashed border-border pt-3 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatRWF(sale.subtotal)}</span></div>
            {sale.discountTotal > 0 ? (
              <div className="flex justify-between text-emerald-700"><span>Discount</span><span className="tabular-nums">-{formatRWF(sale.discountTotal)}</span></div>
            ) : null}
            <div className="flex justify-between text-base font-bold"><span>Total</span><span className="tabular-nums">{formatRWF(sale.total)}</span></div>
            <p className="text-[10px] text-muted-foreground">Items: {totalQty}</p>
          </div>

          {/* Payments */}
          <div className="flex flex-col gap-1 border-t border-dashed border-border pt-3 text-xs">
            {sale.payments.map((payment, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span>
                  {PAYMENT_LABELS[payment.method] ?? payment.method}
                  {payment.reference ? ` · ref ${payment.reference}` : ""}
                </span>
                <span className="tabular-nums">{formatRWF(payment.amount)}</span>
              </div>
            ))}
            {sale.changeDue > 0 ? (
              <div className="flex justify-between font-semibold"><span>Change due</span><span className="tabular-nums">{formatRWF(sale.changeDue)}</span></div>
            ) : null}
          </div>

          <p className="border-t border-dashed border-border pt-3 text-center text-[10px] text-muted-foreground">
            #{sale.receiptNumber} · {store.receipt_footer ?? "Thank you for shopping with us"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  card: "Card",
  bank_transfer: "Bank transfer",
};

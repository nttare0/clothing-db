"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, PrinterIcon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorAlert } from "@/components/state";
import { Skeleton } from "@/components/ui/skeleton";

type Eligibility = {
  saleId: string;
  receiptNumber: string | null;
  completedAt: string | null;
  returnStatus: string;
  items: {
    saleItemId: string;
    variantId: string | null;
    productName: string;
    variantLabel: string;
    sku: string;
    unitPrice: number;
    sold: number;
    returned: number;
    returnable: number;
  }[];
};

const REASONS = [
  { id: "customer_return", label: "Customer changed their mind" },
  { id: "wrong_size", label: "Wrong size" },
  { id: "defect", label: "Defective item" },
  { id: "wrong_item", label: "Wrong item delivered" },
  { id: "other", label: "Other" },
];

const REFUND_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "mobile_money", label: "Mobile Money" },
  { id: "card", label: "Card" },
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "store_credit", label: "Store credit" },
];

function ReturnForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const saleId = searchParams.get("sale") ?? "";

  const [data, setData] = useState<Eligibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [disposition, setDisposition] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("customer_return");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ refundTotal: number } | null>(null);

  const load = useCallback(() => {
    if (!saleId) {
      setError("No sale selected. Open a sale from Sales history and choose Start return.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api<Eligibility>(`/returns/eligibility?saleId=${encodeURIComponent(saleId)}`)
      .then((d) => {
        setData(d);
        const defaults: Record<string, string> = {};
        for (const item of d.items) defaults[item.saleItemId] = "0";
        setQty(defaults);
        setDisposition(Object.fromEntries(d.items.map((i) => [i.saleItemId, "resellable"])));
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load the sales for a return. Check your internet connection and try again."),
      )
      .finally(() => setLoading(false));
  }, [saleId]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = (data?.items ?? [])
    .map((item) => ({ item, quantity: Number(qty[item.saleItemId] ?? "0") || 0 }))
    .filter(({ quantity }) => quantity > 0);
  const refundTotal = selected.reduce((sum, { item, quantity }) => sum + item.unitPrice * quantity, 0);
  const hasInvalid = selected.some(({ item, quantity }) => quantity > item.returnable);

  async function submit() {
    if (!data || selected.length === 0 || hasInvalid) return;
    setPending(true);
    setFormError(null);
    try {
      const result = await api<{ id: string; refundTotal: number }>("/returns", {
        method: "POST",
        body: {
          saleId: data.saleId,
          reason,
          note: note.trim() || null,
          refundMethod,
          items: selected.map(({ item, quantity }) => ({
            saleItemId: item.saleItemId,
            quantity,
            disposition: disposition[item.saleItemId] ?? "resellable",
          })),
        },
      });
      setDone({ refundTotal: result.refundTotal });
      toast.success(`Return recorded — refund ${formatRWF(result.refundTotal)}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "We couldn't record the return. Nothing was refunded yet — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Link href="/returns" className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Back to returns">
          <ArrowLeftIcon />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Process return</h1>
          <p className="text-sm text-muted-foreground">Refund against the original receipt. Stock re-enters by disposition.</p>
        </div>
      </div>

      {loading ? (
        <>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </>
      ) : error ? (
        <ErrorAlert message={error} onRetry={load} />
      ) : done && data ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Undo2Icon className="size-5 text-emerald-600" aria-hidden /> Return recorded</CardTitle>
            <CardDescription>
              Receipt {data.receiptNumber} · refund {formatRWF(done.refundTotal)} via{" "}
              {REFUND_METHODS.find((m) => m.id === refundMethod)?.label ?? refundMethod}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/returns" className={buttonVariants()}>View returns</Link>
            <Link href={`/sales/${data.saleId}`} className={buttonVariants({ variant: "outline" })}>Back to sale</Link>
            <Button variant="outline" onClick={() => window.print()}><PrinterIcon aria-hidden /> Print return note</Button>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Receipt {data.receiptNumber}</CardTitle>
                <CardDescription>{data.completedAt ? formatDateTime(data.completedAt) : ""}</CardDescription>
              </div>
              <Badge variant={data.returnStatus === "none" ? "secondary" : "warning"}>
                {data.returnStatus === "full" ? "Fully returned" : data.returnStatus === "partial" ? "Partially returned" : "No returns yet"}
              </Badge>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Item</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Returnable</TableHead>
                    <TableHead className="text-right">Return qty</TableHead>
                    <TableHead>Disposition</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.saleItemId}>
                      <TableCell className="pl-4">
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.variantLabel} · {formatRWF(item.unitPrice)}</p>
                      </TableCell>
                      <TableCell className="max-w-36 break-all font-mono text-xs">{item.sku}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.returnable} / {item.sold}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={item.returnable}
                          disabled={item.returnable === 0}
                          aria-label={`Return quantity for ${item.sku}`}
                          className="ml-auto h-9 w-20 text-right"
                          value={qty[item.saleItemId] ?? "0"}
                          onChange={(e) => setQty((q) => ({ ...q, [item.saleItemId]: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell>
                        <NativeSelect
                          aria-label={`Disposition for ${item.sku}`}
                          className="h-9"
                          value={disposition[item.saleItemId] ?? "resellable"}
                          onChange={(e) => setDisposition((d) => ({ ...d, [item.saleItemId]: e.target.value }))}
                        >
                          <NativeSelectOption value="resellable">Resellable</NativeSelectOption>
                          <NativeSelectOption value="damaged">Damaged</NativeSelectOption>
                          <NativeSelectOption value="quarantine">Quarantine</NativeSelectOption>
                        </NativeSelect>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Refund</CardTitle>
              <CardDescription>Exchange = this return plus a new sale at the till.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reason">Reason</Label>
                <NativeSelect id="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {REASONS.map((r) => <NativeSelectOption key={r.id} value={r.id}>{r.label}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="refund-method">Refund method</Label>
                <NativeSelect id="refund-method" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                  {REFUND_METHODS.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.label}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="note">Note (optional)</Label>
                <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context for the audit trail" />
              </div>
              {formError ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{formError}</p> : null}
              {hasInvalid ? <p role="alert" className="text-sm text-destructive sm:col-span-2">A return quantity exceeds what is returnable for that line.</p> : null}
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <p className="text-sm text-muted-foreground">
                  Refund total <span className="ml-1 text-base font-semibold tabular-nums text-foreground">{formatRWF(refundTotal)}</span>
                </p>
                <Button size="lg" disabled={pending || selected.length === 0 || hasInvalid} onClick={submit}>
                  {pending ? "Recording…" : "Record return"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function ReturnNewPage() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-64 w-full" /></div>}>
      <ReturnForm />
    </Suspense>
  );
}

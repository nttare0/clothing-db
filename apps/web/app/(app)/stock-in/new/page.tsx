"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, PackagePlusIcon, ScanBarcodeIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/state";
import { SearchInput } from "@/components/search-input";

type Option = {
  variantId: string;
  productName: string;
  label: string;
  sku: string;
  sellable: number;
};

type Line = {
  variantId: string;
  label: string;
  sku: string;
  quantity: string;
  unitCost: string;
};

const REASONS = [
  { id: "opening_stock", label: "Opening stock" },
  { id: "purchase", label: "Purchase from supplier" },
  { id: "return_from_customer", label: "Return from customer" },
  { id: "correction", label: "Correction" },
  { id: "transfer_in", label: "Transfer in" },
];

function StockInForm() {
  const params = useSearchParams();
  const prefillVariant = params.get("variantId") ?? "";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Option[]>([]);
  const [searched, setSearched] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [reason, setReason] = useState("purchase");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    api<{ items: Option[] }>(`/pos/search?q=${encodeURIComponent(trimmed)}`)
      .then((r) => setResults(r.items))
      .catch(() => setResults([]))
      .finally(() => setSearched(true));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 200);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  // Prefill a line when arriving from a product page (?variantId=...)
  useEffect(() => {
    if (!prefillVariant) return;
    api<Option[]>(`/variants/lookup?variantId=${encodeURIComponent(prefillVariant)}`)
      .then((items) => {
        const v = items[0];
        if (v) addLine(v);
      })
      .catch(() => {
        /* lookup endpoint may not exist yet; ignore */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillVariant]);

  function addLine(option: Option) {
    setLines((rows) => {
      if (rows.some((r) => r.variantId === option.variantId)) return rows;
      return [
        ...rows,
        { variantId: option.variantId, label: option.label, sku: option.sku, quantity: "1", unitCost: "" },
      ];
    });
    setQuery("");
    setResults([]);
    setSearched(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (lines.length === 0) {
      setError("Add at least one item.");
      return;
    }
    for (const line of lines) {
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError(`Quantity for ${line.sku} must be a positive number.`);
        return;
      }
      if (line.unitCost !== "" && (!Number.isFinite(Number(line.unitCost)) || Number(line.unitCost) < 0)) {
        setError(`Unit cost for ${line.sku} must be zero or more.`);
        return;
      }
    }
    setPending(true);
    try {
      const result = await api<{ id: string }>("/stock-in", {
        method: "POST",
        body: {
          reason,
          reference: reference.trim() || null,
          note: note.trim() || null,
          items: lines.map((l) => ({
            variantId: l.variantId,
            quantity: Number(l.quantity),
            unitCost: l.unitCost === "" ? null : Number(l.unitCost),
          })),
        },
      });
      toast.success("Stock received", { description: "Quantities are available for sale immediately." });
      window.location.assign(`/stock-movements?reference=${result.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't save the receipt. Nothing was recorded — please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/stock-in" className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" aria-hidden /> Stock in
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Receive stock</h1>
          <p className="text-sm text-muted-foreground">Record stock arriving into the store. Cost updates the moving average.</p>
        </div>
      </div>

      {error ? <ErrorAlert message={error} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ScanBarcodeIcon className="size-4" aria-hidden /> Add items</CardTitle>
          <CardDescription>Scan a barcode or search by product name / SKU.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <SearchInput
            ariaLabel="Search products to add"
            autoFocus
            placeholder="Scan barcode or search…"
            value={query}
            onChange={setQuery}
          />
          {results.length > 0 ? (
            <ul className="flex flex-col gap-1.5 rounded-xl border border-border p-2">
              {results.map((r) => (
                <li key={r.variantId}>
                  <button
                    type="button"
                    onClick={() => addLine(r)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.productName}</span>
                      <span className="block text-xs text-muted-foreground">{r.label} · {r.sku}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{r.sellable} on hand</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : searched ? (
            <p className="text-center text-xs text-muted-foreground">No matches for “{query.trim()}”.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt items</CardTitle>
          <CardDescription>Quantity received and what it cost (optional but recommended).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No items yet — scan or search above.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {lines.map((line, i) => (
                <li key={line.variantId} className="grid grid-cols-12 items-end gap-2 py-2">
                  <div className="col-span-12 sm:col-span-4">
                    <p className="max-w-64 truncate text-sm font-medium" title={line.label}>{line.label}</p>
                    <p className="max-w-64 truncate text-xs text-muted-foreground" title={line.sku}>{line.sku}</p>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label htmlFor={`qty-${i}`} className="text-xs">Qty *</Label>
                    <Input id={`qty-${i}`} inputMode="numeric" className="tabular-nums" value={line.quantity} onChange={(e) => setLines((rows) => rows.map((r, j) => (j === i ? { ...r, quantity: e.target.value } : r)))} />
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <Label htmlFor={`cost-${i}`} className="text-xs">Unit cost (RWF)</Label>
                    <Input id={`cost-${i}`} inputMode="numeric" className="tabular-nums" placeholder="0" value={line.unitCost} onChange={(e) => setLines((rows) => rows.map((r, j) => (j === i ? { ...r, unitCost: e.target.value } : r)))} />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove line" onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))}>
                      <Trash2Icon />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason *</Label>
            <NativeSelect id="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <NativeSelectOption key={r.id} value={r.id}>{r.label}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reference">Reference</Label>
            <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="GRN-0007 / supplier invoice no." />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="note">Note</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the ledger" />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => window.history.back()}>Cancel</Button>
        <Button type="submit" size="lg" disabled={pending || lines.length === 0}>
          {pending ? "Saving…" : <><PackagePlusIcon aria-hidden /> Confirm stock in</>}
        </Button>
      </div>
    </form>
  );
}

export default function StockInNewPage() {
  return (
    <Suspense fallback={null}>
      <StockInForm />
    </Suspense>
  );
}

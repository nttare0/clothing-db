"use client";

import { useCallback, useEffect, useState } from "react";
import { SearchIcon, SlidersHorizontalIcon, ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RoleGate } from "@/components/role-gate";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type SearchResult = {
  variantId: string;
  productName: string;
  label: string;
  sku: string;
  price: number | null;
  sellable: number;
};

type AdjustmentRow = {
  id: string;
  createdAt: string;
  type: string;
  productName: string;
  label: string;
  sku: string;
  onHandDelta: number;
  reason: string | null;
  reference: string | null;
  actor: string | null;
};

const KINDS = [
  { id: "loss", label: "Lost / missing", hint: "Stock is gone from the shelf. Reduces on-hand." },
  { id: "damage", label: "Damaged", hint: "Still on the shelf but not sellable. Moves to the damaged bucket." },
  { id: "found", label: "Found stock", hint: "Physical units found that were not recorded. Increases on-hand." },
  { id: "correction", label: "Correction", hint: "Fix a recorded quantity. Choose increase or decrease." },
] as const;

export default function AdjustmentsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("loss");
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [recent, setRecent] = useState<AdjustmentRow[] | null>(null);

  const search = useCallback(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    api<{ items: SearchResult[] }>(`/pos/search?q=${encodeURIComponent(q)}`)
      .then((r) => setResults(r.items))
      .catch(() => setResults([]));
  }, [query]);

  useEffect(() => {
    const t = setTimeout(search, 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadRecent = useCallback(() => {
    api<{ items: AdjustmentRow[] }>("/stock-movements?type=ADJUSTMENT,LOSS,DAMAGE&pageSize=10")
      .then((r) => setRecent(r.items))
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const selectedKind = KINDS.find((k) => k.id === kind)!;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      setFormError("Pick a variant first.");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      setFormError("Quantity must be a positive whole number.");
      return;
    }
    if (!reason.trim()) {
      setFormError("A reason is required for every adjustment.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      await api("/adjustments", {
        method: "POST",
        body: {
          variantId: selected.variantId,
          kind,
          quantity: qty,
          direction: kind === "correction" ? direction : undefined,
          reason: reason.trim(),
          note: note.trim() || null,
        },
      });
      toast.success("Adjustment recorded");
      setSelected(null);
      setQuery("");
      setResults([]);
      setQuantity("1");
      setReason("");
      setNote("");
      loadRecent();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not record the adjustment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <RoleGate allow={["owner", "manager"]}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Stock adjustments</h1>
          <p className="text-sm text-muted-foreground">Losses, damage, found stock and corrections — every one is posted to the ledger with a reason.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><SlidersHorizontalIcon className="size-5" aria-hidden /> New adjustment</CardTitle>
              <CardDescription>There is no direct quantity edit — this form posts a signed movement.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="variant-search">Variant</Label>
                  {selected ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{selected.productName} · {selected.label}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{selected.sku} · sellable {selected.sellable}</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setSelected(null)}>Change</Button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input id="variant-search" type="search" placeholder="Search name, SKU or barcode…" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
                      </div>
                      {results.length > 0 ? (
                        <ul className="max-h-56 overflow-y-auto rounded-lg border border-border">
                          {results.map((r) => (
                            <li key={r.variantId}>
                              <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted" onClick={() => { setSelected(r); setResults([]); }}>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">{r.productName} · {r.label}</span>
                                  <span className="font-mono text-[11px] text-muted-foreground">{r.sku} · sellable {r.sellable}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="kind">Type</Label>
                    <NativeSelect id="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                      {KINDS.map((k) => <NativeSelectOption key={k.id} value={k.id}>{k.label}</NativeSelectOption>)}
                    </NativeSelect>
                    <p className="text-[11px] text-muted-foreground">{selectedKind.hint}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-end gap-2">
                      {kind === "correction" ? (
                        <NativeSelect aria-label="Direction" className="w-28" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
                          <NativeSelectOption value="decrease">Decrease</NativeSelectOption>
                          <NativeSelectOption value="increase">Increase</NativeSelectOption>
                        </NativeSelect>
                      ) : null}
                      <div className="flex-1">
                        <Label htmlFor="quantity">Quantity</Label>
                        <Input id="quantity" type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reason">Reason <span className="text-destructive">*</span></Label>
                    <Input id="reason" placeholder="e.g. Torn during display" value={reason} onChange={(e) => setReason(e.target.value)} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="note">Note (optional)</Label>
                    <Input id="note" placeholder="Reference / context" value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                </div>

                {formError ? <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><ShieldAlertIcon className="size-4" aria-hidden />{formError}</p> : null}
                <Button type="submit" size="lg" className="w-fit" disabled={pending}>{pending ? "Recording…" : "Record adjustment"}</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="p-0">
            <CardHeader className="p-4 pb-0">
              <CardTitle>Recent adjustments</CardTitle>
              <CardDescription>Latest adjustment-type ledger entries.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {recent === null ? (
                <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : recent.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No adjustments recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</TableCell>
                        <TableCell>
                          <p className="max-w-44 truncate text-sm">{row.productName} · {row.label}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{row.sku}</p>
                        </TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums ${row.onHandDelta < 0 ? "text-destructive" : "text-emerald-600"}`}>
                          {row.onHandDelta > 0 ? `+${row.onHandDelta}` : row.onHandDelta}
                        </TableCell>
                        <TableCell className="max-w-36 truncate text-xs text-muted-foreground" title={row.reason ?? undefined}>
                          <Badge variant="outline" className="mr-1 text-[9px] uppercase">{row.type}</Badge>
                          {row.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </RoleGate>
  );
}

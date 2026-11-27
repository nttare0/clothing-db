"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheckIcon, PackageCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { SearchInput } from "@/components/search-input";

type Countable = {
  variantId: string;
  productName: string;
  label: string;
  sku: string;
  onHand: number;
  sellable: number;
  category: string | null;
};

type CountSession = {
  id: string;
  createdAt: string;
  scope: string;
  note: string | null;
  createdBy: string | null;
  lines: number;
  variances: number;
};

export default function StockCountPage() {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [variants, setVariants] = useState<Countable[] | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CountSession[] | null>(null);

  useEffect(() => {
    api<{ items: { id: string; name: string }[] }>("/categories")
      .then((r) => setCategories(r.items))
      .catch(() => setCategories([]));
    loadSessions();
  }, []);

  const loadSessions = useCallback(() => {
    api<{ items: CountSession[] }>("/stock-counts")
      .then((r) => setSessions(r.items))
      .catch(() => setSessions([]));
  }, []);

  const loadVariants = useCallback(() => {
    setError(null);
    setVariants(null);
    const q = new URLSearchParams();
    if (scope !== "all") q.set("categoryId", scope);
    if (search.trim()) q.set("search", search.trim());
    api<{ items: Countable[] }>(`/stock-counts/countable?${q.toString()}`)
      .then((r) => {
        setVariants(r.items);
        setCounts({});
        setConfirming(false);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "We couldn't load the variants. Check your internet connection and try again."));
  }, [scope, search]);

  const countedLines = useMemo(
    () => (variants ?? [])
      .map((v) => ({ v, counted: counts[v.variantId] }))
      .filter(({ counted }) => counted !== undefined && counted !== "")
      .map(({ v, counted }) => ({ v, counted: Number(counted) })),
    [variants, counts],
  );

  const varianceLines = useMemo(
    () => countedLines.filter(({ v, counted }) => Number.isInteger(counted) && counted !== v.onHand),
    [countedLines],
  );
  const invalid = countedLines.some(({ counted }) => !Number.isInteger(counted) || counted < 0);

  async function post() {
    if (countedLines.length === 0 || invalid) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const result = await api<{ countId: string; lines: number; variances: number }>("/stock-counts", {
        method: "POST",
        body: {
          scope,
          note: note.trim() || null,
          items: countedLines.map(({ v, counted }) => ({ variantId: v.variantId, counted })),
        },
      });
      toast.success(`Count posted — ${result.variances} variance${result.variances === 1 ? "" : "s"} reconciled`);
      setVariants(null);
      setCounts({});
      setNote("");
      setConfirming(false);
      loadSessions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't save the count. Please try again.");
      setConfirming(false);
    } finally {
      setPosting(false);
    }
  }

  return (
    <RoleGate allow={["owner", "manager", "stock_clerk"]}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Stock count</h1>
          <p className="text-sm text-muted-foreground">Count what is physically on the shelf. Uncounted lines are ignored — they are never treated as zero.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardCheckIcon className="size-5" aria-hidden /> Load variants</CardTitle>
            <CardDescription>Snapshot the expected quantities, enter your physical counts, review variances, then post.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5 sm:w-56">
              <Label htmlFor="scope">Scope</Label>
              <NativeSelect id="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
                <NativeSelectOption value="all">All active variants</NativeSelectOption>
                {categories.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <SearchInput
              className="flex-1"
              ariaLabel="Filter variants"
              placeholder="Filter by name or SKU…"
              value={search}
              onChange={setSearch}
            />
            <Button onClick={loadVariants}>Load</Button>
          </CardContent>
        </Card>

        {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

        {variants ? (
          <Card className="p-0">
            <CardHeader className="flex-col items-start gap-3 space-y-0 p-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Count sheet</CardTitle>
                <CardDescription>{variants.length} variant{variants.length === 1 ? "" : "s"} · {countedLines.length} counted · {varianceLines.length} variance{varianceLines.length === 1 ? "" : "s"}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCounts(Object.fromEntries(variants.map((v) => [v.variantId, String(v.onHand)])))}>Fill expected</Button>
                <Button size="sm" onClick={post} disabled={posting || countedLines.length === 0 || invalid}>
                  {posting ? "Posting…" : confirming ? `Confirm post (${varianceLines.length} variances)` : "Post count"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Variant</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Counted</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variants.map((v) => {
                      const raw = counts[v.variantId];
                      const counted = raw === undefined || raw === "" ? null : Number(raw);
                      const variance = counted === null || !Number.isInteger(counted) ? null : counted - v.onHand;
                      return (
                        <TableRow key={v.variantId} className={variance !== null && variance !== 0 ? "bg-amber-50/60" : undefined}>
                          <TableCell className="pl-4">
                            <p className="max-w-52 truncate text-sm font-medium">{v.productName} · {v.label}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{v.sku}</p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{v.onHand}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              aria-label={`Counted for ${v.sku}`}
                              className="ml-auto h-9 w-20 text-right"
                              placeholder="0"
                              value={raw ?? ""}
                              onChange={(e) => { setCounts((c0) => ({ ...c0, [v.variantId]: e.target.value })); setConfirming(false); }}
                            />
                          </TableCell>
                          <TableCell className={`text-right font-semibold tabular-nums ${variance === null ? "text-muted-foreground" : variance === 0 ? "text-muted-foreground" : variance < 0 ? "text-destructive" : "text-emerald-600"}`}>
                            {variance === null ? "—" : variance > 0 ? `+${variance}` : variance}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row sm:items-center">
                <Label htmlFor="count-note" className="shrink-0">Note</Label>
                <Input id="count-note" placeholder="e.g. End-of-day count, 26 Nov" value={note} onChange={(e) => setNote(e.target.value)} />
                {confirming ? <p className="text-xs font-medium text-amber-700">Posting rewrites balances to your counted values with COUNT movements. Click Confirm to commit.</p> : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PackageCheckIcon className="size-5" aria-hidden /> Recent counts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sessions === null ? (
              <div className="flex flex-col gap-2 p-2">{[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : sessions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No count sessions posted yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Variances</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-4 text-sm text-muted-foreground">{formatDateTime(s.createdAt)}</TableCell>
                      <TableCell className="text-sm">{s.scope === "all" ? "All variants" : "Category scope"}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.lines}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.variances}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.createdBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGate>
  );
}

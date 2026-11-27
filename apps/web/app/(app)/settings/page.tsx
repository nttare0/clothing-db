"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsIcon, StoreIcon, ReceiptTextIcon, GaugeIcon, InfoIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/state";
import { RoleGate } from "@/components/role-gate";

type Settings = {
  store_name?: string;
  store_address?: string;
  store_phone?: string;
  receipt_footer?: string;
  low_stock_default?: number;
  allowed_payment_methods?: string[];
};

const METHODS: { id: string; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "mobile_money", label: "Mobile Money" },
  { id: "card", label: "Card" },
  { id: "bank_transfer", label: "Bank transfer" },
];

export default function SettingsPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api<Settings>("/settings")
      .then(setForm)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load the settings. Check your internet connection and try again."),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleMethod(method: string) {
    setForm((f) => {
      if (!f) return f;
      const current = new Set(f.allowed_payment_methods ?? []);
      if (current.has(method)) current.delete(method);
      else current.add(method);
      return { ...f, allowed_payment_methods: [...current] };
    });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    if ((form.allowed_payment_methods ?? []).length === 0) {
      toast.error("Keep at least one payment method enabled.");
      return;
    }
    setPending(true);
    try {
      await api("/settings", {
        method: "PATCH",
        body: {
          store_name: form.store_name?.trim() || undefined,
          store_address: form.store_address?.trim() || undefined,
          store_phone: form.store_phone?.trim() || undefined,
          receipt_footer: form.receipt_footer?.trim() || undefined,
          low_stock_default: form.low_stock_default,
          allowed_payment_methods: form.allowed_payment_methods,
        },
      });
      toast.success("Settings saved");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "We couldn't save the settings. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <RoleGate allow={["owner"]}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl"><SettingsIcon className="size-6" aria-hidden /> Settings</h1>
          <p className="text-sm text-muted-foreground">Owner-only. Changes apply immediately — receipts print with the new identity on the next sale.</p>
        </div>

        {error ? <ErrorAlert message={error} onRetry={load} /> : null}

        {!form ? (
          <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><StoreIcon className="size-5" aria-hidden /> Store identity</CardTitle>
                <CardDescription>Printed at the top of every receipt.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="store-name">Store name</Label>
                  <Input id="store-name" value={form.store_name ?? ""} onChange={(e) => setForm({ ...form, store_name: e.target.value })} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="store-address">Address</Label>
                  <Input id="store-address" value={form.store_address ?? ""} onChange={(e) => setForm({ ...form, store_address: e.target.value })} placeholder="e.g. Kigali — Kimironko Market, Block B" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="store-phone">Phone</Label>
                  <Input id="store-phone" inputMode="tel" value={form.store_phone ?? ""} onChange={(e) => setForm({ ...form, store_phone: e.target.value })} placeholder="+250 …" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ReceiptTextIcon className="size-5" aria-hidden /> Receipt</CardTitle>
                <CardDescription>Footer line printed under the totals.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                <Label htmlFor="receipt-footer">Footer line</Label>
                <Textarea id="receipt-footer" rows={2} maxLength={200} value={form.receipt_footer ?? ""} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} placeholder="Thank you for shopping with us" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><GaugeIcon className="size-5" aria-hidden /> Operations</CardTitle>
                <CardDescription>Defaults used by inventory alerts and the till.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5 sm:max-w-48">
                  <Label htmlFor="low-stock">Default low-stock threshold</Label>
                  <Input id="low-stock" type="number" inputMode="numeric" min={0} value={form.low_stock_default ?? 5} onChange={(e) => setForm({ ...form, low_stock_default: Math.max(0, Number(e.target.value) || 0) })} />
                  <p className="text-[11px] text-muted-foreground">Used when a variant has no per-variant reorder level.</p>
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">Accepted payment methods</legend>
                  <div className="flex flex-wrap gap-2">
                    {METHODS.map((m) => {
                      const active = (form.allowed_payment_methods ?? []).includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleMethod(m.id)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardContent className="flex items-start gap-2 pt-4 text-xs text-muted-foreground">
                <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>Store timezone (Africa/Kigali, UTC+2), currency (RWF) and costing method (moving average) are fixed for this build. Contact the maintainer to change them.</p>
              </CardContent>
            </Card>

            <div>
              <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
            </div>
          </form>
        )}
      </div>
    </RoleGate>
  );
}

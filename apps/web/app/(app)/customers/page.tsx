"use client";

import { useCallback, useEffect, useState } from "react";
import { UsersIcon, PlusIcon, PencilIcon, HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlert, EmptyState } from "@/components/state";
import { SearchInput } from "@/components/search-input";

type Customer = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  notes: string | null;
  status: string;
  salesCount: number;
  salesTotal: number;
};

type SaleRow = {
  id: string;
  receiptNumber: string | null;
  completedAt: string | null;
  total: number;
};

const emptyForm = { name: "", phone: "", email: "", notes: "" };

export default function CustomersPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [historyFor, setHistoryFor] = useState<Customer | null>(null);
  const [history, setHistory] = useState<SaleRow[] | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (query.trim()) q.set("search", query.trim());
    api<{ items: Customer[] }>(`/customers?${q.toString()}`)
      .then((r) => setItems(r.items))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load the customers. Check your internet connection and try again."),
      )
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name ?? "", phone: c.phone, email: c.email ?? "", notes: c.notes ?? "" });
    setFormError(null);
    setDialogOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = form.phone.replace(/\s+/g, "").trim();
    if (!/^(?:\+?250|0)?7[2389]\d{7}$/.test(phone)) {
      setFormError("Enter a valid Rwandan phone number (e.g. +250 788 123 456).");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const body = {
        name: form.name.trim() || null,
        phone,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await api(`/customers/${editing.id}`, { method: "PATCH", body });
        toast.success("Customer updated");
      } else {
        await api("/customers", { method: "POST", body });
        toast.success("Customer added");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "We couldn't save the customer. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function openHistory(c: Customer) {
    setHistoryFor(c);
    setHistory(null);
    try {
      const r = await api<{ items: SaleRow[] }>(`/customers/${c.id}/sales`);
      setHistory(r.items);
    } catch {
      setHistory([]);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Customers</h1>
          <p className="text-sm text-muted-foreground">Optional phone registration — used to match sales to a customer and to send receipts.</p>
        </div>
        <Button onClick={openCreate}><PlusIcon aria-hidden /> Add customer</Button>
      </div>

      <SearchInput
        ariaLabel="Search customers"
        placeholder="Search name, phone or email…"
        value={query}
        onChange={setQuery}
      />

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {loading ? (
        <Card><CardContent className="flex flex-col gap-2 pt-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</CardContent></Card>
      ) : items && items.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Capture a phone number at the till to build a repeat-customer history."
          action={<Button onClick={openCreate}><PlusIcon aria-hidden /> Add customer</Button>}
        />
      ) : items ? (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Total spent</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-4">
                    <span className="block max-w-52 truncate font-medium" title={c.name ?? "Unnamed customer"}>{c.name ?? "Unnamed customer"}</span>
                    {c.email ? <p className="max-w-52 truncate text-xs text-muted-foreground" title={c.email}>{c.email}</p> : null}
                    {c.notes ? <p className="max-w-52 truncate text-xs text-muted-foreground" title={c.notes}>{c.notes}</p> : null}
                  </TableCell>
                  <TableCell className="max-w-40 break-all font-mono text-sm">{c.phone}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.salesCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRWF(c.salesTotal)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Purchase history" title="Purchase history" onClick={() => openHistory(c)}><HistoryIcon /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Edit customer" onClick={() => openEdit(c)}><PencilIcon /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
            <DialogDescription>Phone is unique — duplicate numbers are rejected.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-name">Name</Label>
              <Input id="cust-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Aline Iradukunda" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-phone">Phone <span className="text-destructive">*</span></Label>
              <Input id="cust-phone" inputMode="tel" required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+250 788 000 000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-email">Email</Label>
              <Input id="cust-email" type="email" placeholder="customer@example.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-notes">Notes</Label>
              <Input id="cust-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Sizing preference, usual orders…" />
            </div>
            {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save customer"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyFor !== null} onOpenChange={(open) => { if (!open) setHistoryFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sales to {historyFor?.name ?? historyFor?.phone}</DialogTitle>
            <DialogDescription>Matched by the phone recorded at the till.</DialogDescription>
          </DialogHeader>
          {history === null ? (
            <Skeleton className="h-32 w-full" />
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No sales recorded for this customer yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-sm text-muted-foreground">{h.completedAt ? formatDateTime(h.completedAt) : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{h.receiptNumber ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRWF(h.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { PlusIcon, PencilIcon, ArchiveIcon, HistoryIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { RoleGate } from "@/components/role-gate";
import { SearchInput } from "@/components/search-input";
import { PhoneInput } from "@/components/phone-input";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Supplier = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  purchaseCount: number;
  totalPurchaseCost: number;
};

type RawPurchaseRow = {
  id: string;
  reference: string | null;
  reason: string;
  received_at: string;
  total_cost: string | null;
  received_by: string | null;
};

const emptyForm = { name: "", contactName: "", phone: "", email: "", address: "" };

export default function SuppliersPage() {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleteFor, setDeleteFor] = useState<Supplier | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [items, setItems] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [historyFor, setHistoryFor] = useState<Supplier | null>(null);
  const [history, setHistory] = useState<RawPurchaseRow[] | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (query.trim()) q.set("search", query.trim());
    if (showArchived) q.set("includeArchived", "1");
    api<{ items: Supplier[] }>(`/suppliers?${q.toString()}`)
      .then((r) => setItems(r.items))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load the suppliers. Check your internet connection and try again."),
      )
      .finally(() => setLoading(false));
  }, [query, showArchived]);

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

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, contactName: s.contactPerson ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "" });
    setFormError(null);
    setDialogOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormError("Supplier name is required.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const body = {
        name: form.name.trim(),
        contactPerson: form.contactName.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      };
      if (editing) {
        await api(`/suppliers/${editing.id}`, { method: "PATCH", body });
        toast.success("Supplier updated");
      } else {
        await api("/suppliers", { method: "POST", body });
        toast.success("Supplier added");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "We couldn't save the supplier. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function toggleArchive(s: Supplier) {
    try {
      await api(`/suppliers/${s.id}`, { method: "PATCH", body: { status: s.status === "active" ? "archived" : "active" } });
      toast.success(s.status === "active" ? "Supplier archived" : "Supplier reactivated");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "We couldn't update the supplier. Please try again.");
    }
  }

  async function openHistory(s: Supplier) {
    setHistoryFor(s);
    setHistory(null);
    try {
      const r = await api<{ items: RawPurchaseRow[] }>(`/suppliers/${s.id}/purchases`);
      setHistory(r.items);
    } catch {
      setHistory([]);
    }
  }

  async function confirmDelete() {
    if (!deleteFor) return;
    setDeletePending(true);
    try {
      await api(`/suppliers/${deleteFor.id}`, { method: "DELETE" });
      toast.success("Supplier deleted");
      setDeleteFor(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "We couldn't delete the supplier. Archive it instead.");
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <RoleGate allow={["owner", "manager"]}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Suppliers</h1>
            <p className="text-sm text-muted-foreground">Where stock comes from — used when receiving stock-in.</p>
          </div>
          <Button onClick={openCreate}><PlusIcon aria-hidden /> Add supplier</Button>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <SearchInput
            className="flex-1"
            ariaLabel="Search suppliers"
            placeholder="Search name, contact, phone…"
            value={query}
            onChange={setQuery}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="size-4 rounded border-border" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>

        {error ? <ErrorAlert message={error} onRetry={load} /> : null}

        {loading ? (
          <Card><CardContent className="flex flex-col gap-2 pt-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</CardContent></Card>
        ) : items && items.length === 0 ? (
          <EmptyState
            title="No suppliers yet"
            description="Add your first supplier to track who you buy from and at what cost."
            action={<Button onClick={openCreate}><PlusIcon aria-hidden /> Add supplier</Button>}
          />
        ) : items ? (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4">
                      <span className="block max-w-56 truncate font-medium" title={s.name}>{s.name}</span>
                      {s.status === "archived" ? <Badge variant="secondary" className="ml-2 text-[10px]">Archived</Badge> : null}
                      {s.address ? <p className="max-w-56 truncate text-xs text-muted-foreground" title={s.address}>{s.address}</p> : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.contactPerson ? <span className="block max-w-52 truncate" title={s.contactPerson}>{s.contactPerson}</span> : null}
                      {s.phone ? <span className="block max-w-52 break-all text-muted-foreground">{s.phone}</span> : null}
                      {s.email ? <span className="block max-w-52 truncate text-xs text-muted-foreground" title={s.email}>{s.email}</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.purchaseCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRWF(s.totalPurchaseCost)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Purchase history" title="Purchase history" onClick={() => openHistory(s)}><HistoryIcon /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Edit supplier" onClick={() => openEdit(s)}><PencilIcon /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label={s.status === "active" ? "Archive supplier" : "Reactivate supplier"} onClick={() => toggleArchive(s)}><ArchiveIcon /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Delete supplier" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteFor(s)}><Trash2Icon /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : null}

        {/* Create / edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit supplier" : "Add supplier"}</DialogTitle>
              <DialogDescription>Supplier records feed purchase reports and stock-in references.</DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sup-name">Name <span className="text-destructive">*</span></Label>
                <Input id="sup-name" placeholder="e.g. Kigali Garments Ltd" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sup-contact">Contact person</Label>
                  <Input id="sup-contact" placeholder="e.g. Jean Bosco" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sup-phone">Phone</Label>
                  <PhoneInput id="sup-phone" value={form.phone} onValueChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sup-email">Email</Label>
                <Input id="sup-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sup-address">Address / location</Label>
                <Input id="sup-address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="e.g. Kigali — Kimironko" />
              </div>
              {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save supplier"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Purchase history dialog */}
        <Dialog open={historyFor !== null} onOpenChange={(open) => { if (!open) setHistoryFor(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Purchases from {historyFor?.name}</DialogTitle>
              <DialogDescription>Stock-in receipts attributed to this supplier.</DialogDescription>
            </DialogHeader>
            {history === null ? (
              <Skeleton className="h-32 w-full" />
            ) : history.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No purchases recorded for this supplier yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(h.received_at)}</TableCell>
                      <TableCell className="font-mono text-xs">{h.reference ?? h.reason ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.total_cost !== null ? formatRWF(Number(h.total_cost)) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteFor !== null}
          onOpenChange={(open) => { if (!open) setDeleteFor(null); }}
          title="Delete supplier?"
          description={deleteFor ? (deleteFor.purchaseCount > 0 ? `${deleteFor.name} has ${deleteFor.purchaseCount} purchase record${deleteFor.purchaseCount === 1 ? "" : "s"} — suppliers with purchase history can only be archived.` : `${deleteFor.name} will be removed permanently.`) : ""}
          pending={deletePending}
          onConfirm={confirmDelete}
        />
      </div>
    </RoleGate>
  );
}

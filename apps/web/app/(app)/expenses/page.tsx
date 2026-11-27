"use client";

import { useCallback, useEffect, useState } from "react";
import { PlusIcon, PencilIcon, WalletIcon, CalendarDaysIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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

const CATEGORIES = [
  "Rent",
  "Utilities",
  "Salaries & wages",
  "Transport",
  "Packaging & bags",
  "Marketing",
  "Maintenance & repairs",
  "Licences & taxes",
  "Bank & mobile money charges",
  "Other",
];

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  card: "Card",
  bank_transfer: "Bank transfer",
};

type Expense = {
  id: string;
  expenseDate: string;
  category: string;
  amount: number;
  paymentMethod: string;
  payee: string | null;
  description: string | null;
  enteredBy: string | null;
};

type ListResponse = {
  items: Expense[];
  total: number;
  totalAmount: number;
  monthTotal: number;
  monthByCategory: { category: string; total: number }[];
  page: number;
  pageSize: number;
};

const emptyForm = {
  expenseDate: new Date().toISOString().slice(0, 10),
  category: "Utilities",
  amount: "",
  paymentMethod: "cash",
  payee: "",
  description: "",
};

export default function ExpensesPage() {
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (category !== "all") q.set("category", category);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (query.trim()) q.set("search", query.trim());
    api<ListResponse>(`/expenses?${q.toString()}`)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load the expenses. Check your internet connection and try again."),
      )
      .finally(() => setLoading(false));
  }, [category, from, to, query, page]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(e: Expense) {
    setEditing(e);
    setForm({
      expenseDate: e.expenseDate,
      category: e.category,
      amount: String(e.amount),
      paymentMethod: e.paymentMethod,
      payee: e.payee ?? "",
      description: e.description ?? "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Amount must be greater than zero.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const body = {
        expenseDate: form.expenseDate,
        category: form.category,
        amount,
        paymentMethod: form.paymentMethod,
        payee: form.payee.trim() || null,
        description: form.description.trim() || null,
      };
      if (editing) {
        await api(`/expenses/${editing.id}`, { method: "PATCH", body });
        toast.success("Expense updated");
      } else {
        await api("/expenses", { method: "POST", body });
        toast.success("Expense recorded");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "We couldn't save the expense. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <RoleGate allow={["owner", "manager"]}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Expenses</h1>
            <p className="text-sm text-muted-foreground">Every shilling out except stock — feeds the management P&amp;L.</p>
          </div>
          <Button onClick={openCreate}><PlusIcon aria-hidden /> Record expense</Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><CardContent className="pt-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><CalendarDaysIcon className="size-3.5" aria-hidden /> This month</p>
            <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{data ? formatRWF(data.monthTotal) : "—"}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><WalletIcon className="size-3.5" aria-hidden /> Filtered total</p>
            <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{data ? formatRWF(data.totalAmount) : "—"}</p>
          </CardContent></Card>
          <Card className="col-span-2"><CardContent className="pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Top categories this month</p>
            <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
              {data && data.monthByCategory.length > 0
                ? data.monthByCategory.slice(0, 3).map((c) => `${c.category} (${formatRWF(c.total)})`).join(" · ")
                : "No expenses this month yet"}
            </p>
          </CardContent></Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchInput
            ariaLabel="Search expenses"
            placeholder="Search payee, description, category…"
            className="lg:max-w-xs"
            value={query}
            onChange={(v) => { setQuery(v); setPage(1); }}
          />
          <NativeSelect aria-label="Filter by category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <NativeSelectOption value="all">All categories</NativeSelectOption>
            {CATEGORIES.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
          </NativeSelect>
          <Input type="date" aria-label="From date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <Input type="date" aria-label="To date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>

        {error ? <ErrorAlert message={error} onRetry={load} /> : null}

        {loading ? (
          <Card><CardContent className="flex flex-col gap-2 pt-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</CardContent></Card>
        ) : data && data.items.length === 0 ? (
          <EmptyState title="No expenses found" description="Record rent, utilities, transport and everything else that is not stock." action={<Button onClick={openCreate}><PlusIcon aria-hidden /> Record expense</Button>} />
        ) : data ? (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Payee / description</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-4 text-sm text-muted-foreground">{e.expenseDate}</TableCell>
                    <TableCell className="font-medium">{e.category}</TableCell>
                    <TableCell className="max-w-56 text-sm">
                      {e.payee ? <span className="block truncate">{e.payee}</span> : null}
                      {e.description ? <span className="block truncate text-xs text-muted-foreground" title={e.description}>{e.description}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatRWF(e.amount)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit expense" onClick={() => openEdit(e)}><PencilIcon /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between gap-2 border-t border-border p-3 text-sm">
              <span className="text-muted-foreground">{data.total} expense{data.total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2">
                <button className="rounded-md border border-border px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <span className="tabular-nums text-muted-foreground">{page} / {totalPages}</span>
                <button className="rounded-md border border-border px-2 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </Card>
        ) : null}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit expense" : "Record expense"}</DialogTitle>
              <DialogDescription>Expenses are audit-logged and flow into the P&amp;L report.</DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exp-date">Date</Label>
                  <Input id="exp-date" type="date" value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exp-cat">Category</Label>
                  <NativeSelect id="exp-cat" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
                  </NativeSelect>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exp-amount">Amount (RWF) <span className="text-destructive">*</span></Label>
                  <Input id="exp-amount" type="number" inputMode="numeric" min={1} step="1" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required autoFocus />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exp-method">Payment method</Label>
                  <NativeSelect id="exp-method" value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                    {Object.entries(METHOD_LABELS).map(([id, label]) => <NativeSelectOption key={id} value={id}>{label}</NativeSelectOption>)}
                  </NativeSelect>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exp-payee">Payee / supplier</Label>
                <Input id="exp-payee" value={form.payee} onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))} placeholder="e.g. MTN, landlord, staff name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exp-desc">Description</Label>
                <Textarea id="exp-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What was this for?" />
              </div>
              {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Record expense"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGate>
  );
}

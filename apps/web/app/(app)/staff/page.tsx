"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheckIcon, PlusIcon, KeyRoundIcon, UserXIcon, UserCheckIcon, CopyIcon, Trash2Icon, CalendarClockIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ErrorAlert } from "@/components/state";
import { RoleGate } from "@/components/role-gate";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastSignInAt: string | null;
  createdAt: string;
  activeUntil: string | null;
  passwordChangedAt: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  stock_clerk: "Stock clerk",
  cashier: "Cashier",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Full access, including staff, settings and audit logs",
  manager: "Everything except staff management, settings and audit logs",
  stock_clerk: "Stock intake, counts, inventory and stock movements",
  cashier: "POS, receipts, returns and customer lookup",
};

export default function StaffPage() {
  const [items, setItems] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "cashier" });
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<{ user: StaffMember; action: "deactivate" | "activate" | "reset" | "delete" } | null>(null);
  const [expiry, setExpiry] = useState<{ user: StaffMember; value: string } | null>(null);
  const [expiryPending, setExpiryPending] = useState(false);

  function activeUntilLabel(value: string | null): { text: string; tone: "none" | "ok" | "soon" | "past" } {
    if (!value) return { text: "No limit", tone: "none" };
    const ms = new Date(value).getTime() - Date.now();
    if (ms <= 0) return { text: "Expired", tone: "past" };
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    if (days === 0) return { text: `${hours}h left`, tone: "soon" };
    return { text: `${days}d left`, tone: days <= 3 ? "soon" : "ok" };
  }

  function toLocalInputValue(value: string | null): string {
    if (!value) return "";
    const d = new Date(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function saveExpiry(user: StaffMember, value: string | null) {
    setExpiryPending(true);
    try {
      await api(`/staff/${user.id}`, { method: "PATCH", body: { activeUntil: value ?? "" } });
      toast.success(value ? `${user.name} will be deactivated on ${formatDateTime(value)}` : `Active period cleared for ${user.name}`);
      setExpiry(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not set the active period.");
    } finally {
      setExpiryPending(false);
    }
  }

  function preset(days: number) {
    const d = new Date(Date.now() + days * 86_400_000);
    setExpiry((cur) => (cur ? { ...cur, value: toLocalInputValue(d.toISOString()) } : cur));
  }

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<{ items: StaffMember[] }>("/staff")
      .then((r) => setItems(r.items))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Could not load staff."),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setFormError("Name and email are required.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const r = await api<{ id: string; tempPassword: string }>("/staff", {
        method: "POST",
        body: { name: form.name.trim(), email: form.email.trim(), role: form.role },
      });
      setTempPassword(r.tempPassword);
      setForm({ name: "", email: "", role: "cashier" });
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create the account.");
    } finally {
      setPending(false);
    }
  }

  async function changeRole(user: StaffMember, role: string) {
    try {
      await api(`/staff/${user.id}`, { method: "PATCH", body: { role } });
      toast.success(`${user.name} is now ${ROLE_LABELS[role] ?? role}`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not change the role.");
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    const { user, action } = confirm;
    try {
      if (action === "deactivate") {
        await api(`/staff/${user.id}`, { method: "PATCH", body: { status: "deactivated" } });
        toast.success(`${user.name} deactivated — their sessions were revoked`);
      } else if (action === "activate") {
        await api(`/staff/${user.id}`, { method: "PATCH", body: { status: "active" } });
        toast.success(`${user.name} reactivated`);
      } else if (action === "delete") {
        await api(`/staff/${user.id}`, { method: "DELETE" });
        toast.success(`${user.name} deleted`);
      } else {
        const r = await api<{ tempPassword: string }>(`/staff/${user.id}/reset-password`, { method: "POST" });
        setTempPassword(r.tempPassword);
        toast.success("Password reset — share the new temporary password now");
      }
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setConfirm(null);
    }
  }

  return (
    <RoleGate allow={["owner"]}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl"><ShieldCheckIcon className="size-6" aria-hidden /> Staff &amp; permissions</h1>
            <p className="text-sm text-muted-foreground">Owner-only. Deactivating revokes all live sessions immediately.</p>
          </div>
          <Button onClick={() => { setCreateOpen(true); setTempPassword(null); setFormError(null); }}><PlusIcon aria-hidden /> Add staff</Button>
        </div>

        {error ? <ErrorAlert message={error} onRetry={load} /> : null}

        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Passwords are stored only as bcrypt hashes and can never be viewed — by design. You can see when each password was last set, reset it to a new temporary password, or set the account to deactivate automatically after a chosen period.
        </p>

        {loading ? (
          <Card><CardContent className="flex flex-col gap-2 pt-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</CardContent></Card>
        ) : items ? (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Staff</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Active until</TableHead>
                  <TableHead>Last sign-in / password</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="pl-4">
                      <p className="max-w-44 truncate font-medium" title={u.name}>{u.name}</p>
                      <p className="max-w-44 truncate text-xs text-muted-foreground" title={u.email}>{u.email}</p>
                    </TableCell>
                    <TableCell>
                      <NativeSelect
                        aria-label={`Role for ${u.name}`}
                        className="h-9"
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value)}
                      >
                        {Object.entries(ROLE_LABELS).map(([id, label]) => <NativeSelectOption key={id} value={id}>{label}</NativeSelectOption>)}
                      </NativeSelect>
                    </TableCell>
                    <TableCell>
                      {u.status === "active"
                        ? <Badge variant="success">Active</Badge>
                        : <Badge variant="secondary">Deactivated</Badge>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {(() => {
                        const label = activeUntilLabel(u.activeUntil);
                        return (
                          <button
                            type="button"
                            onClick={() => setExpiry({ user: u, value: toLocalInputValue(u.activeUntil) })}
                            className="group inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted"
                            title={u.activeUntil ? formatDateTime(u.activeUntil) : "No automatic deactivation — click to set one"}
                          >
                            <CalendarClockIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="flex min-w-0 flex-col leading-tight">
                              <span className={label.tone === "soon" ? "font-medium text-amber-600" : label.tone === "past" ? "font-medium text-destructive" : "text-foreground"}>{label.text}</span>
                              <span className="truncate text-[11px] text-muted-foreground">{u.activeUntil ? formatDateTime(u.activeUntil) : "No expiry set"}</span>
                            </span>
                          </button>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="block truncate">{u.lastSignInAt ? formatDateTime(u.lastSignInAt) : "Never"}</span>
                      <span className="block truncate text-[11px]">
                        PW {u.passwordChangedAt ? `set ${formatDateTime(u.passwordChangedAt)}` : "age unknown"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Reset password" title="Reset password" onClick={() => setConfirm({ user: u, action: "reset" })}><KeyRoundIcon /></Button>
                        {u.status === "active" ? (
                          <Button variant="ghost" size="icon-sm" aria-label="Deactivate" title="Deactivate" onClick={() => setConfirm({ user: u, action: "deactivate" })}><UserXIcon /></Button>
                        ) : (
                          <Button variant="ghost" size="icon-sm" aria-label="Reactivate" title="Reactivate" onClick={() => setConfirm({ user: u, action: "activate" })}><UserCheckIcon /></Button>
                        )}
                        <Button variant="ghost" size="icon-sm" aria-label="Set active period" title="Set active period" className="lg:hidden" onClick={() => setExpiry({ user: u, value: toLocalInputValue(u.activeUntil) })}><CalendarClockIcon /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Delete account" title="Delete (only if no store activity)" className="text-destructive hover:text-destructive" onClick={() => setConfirm({ user: u, action: "delete" })}><Trash2Icon /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : null}


        {/* Active period dialog */}
        <Dialog open={expiry !== null} onOpenChange={(open) => { if (!open) setExpiry(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Active period for {expiry?.user.name}</DialogTitle>
              <DialogDescription>
                After the chosen moment the account is deactivated automatically and all its sessions are revoked. Leave it empty for no automatic cut-off.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {[{ label: "7 days", days: 7 }, { label: "30 days", days: 30 }, { label: "90 days", days: 90 }].map((presetOption) => (
                  <Button key={presetOption.days} type="button" variant="outline" size="sm" onClick={() => preset(presetOption.days)}>
                    {presetOption.label}
                  </Button>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setExpiry((cur) => (cur ? { ...cur, value: "" } : cur))}>
                  No limit
                </Button>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="active-until">Deactivate on</Label>
                <Input id="active-until" type="datetime-local" value={expiry?.value ?? ""} onChange={(e) => setExpiry((cur) => (cur ? { ...cur, value: e.target.value } : cur))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExpiry(null)}>Cancel</Button>
              <Button
                disabled={expiryPending}
                onClick={() => {
                  if (!expiry) return;
                  if (!expiry.value) { void saveExpiry(expiry.user, null); return; }
                  const parsed = new Date(expiry.value);
                  if (Number.isNaN(parsed.getTime())) { toast.error("Pick a valid date and time."); return; }
                  void saveExpiry(expiry.user, parsed.toISOString());
                }}
              >
                {expiryPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Role permission matrix */}
        <Card>
          <CardHeader>
            <CardTitle>What each role can do</CardTitle>
            <CardDescription>Enforced on the server for every request — the UI just hides what is off-limits.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {Object.entries(ROLE_DESCRIPTIONS).map(([role, description]) => (
              <div key={role} className="rounded-lg border border-border p-3">
                <p className="font-medium">{ROLE_LABELS[role]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setTempPassword(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add staff account</DialogTitle>
              <DialogDescription>A temporary password is generated and shown once — share it with the staff member in person.</DialogDescription>
            </DialogHeader>
            {tempPassword ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">Account created. Give them this temporary password — it will not be shown again:</p>
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <code className="flex-1 break-all font-mono text-sm">{tempPassword}</code>
                  <Button variant="outline" size="icon-sm" aria-label="Copy temporary password" onClick={() => navigator.clipboard?.writeText(tempPassword).then(() => toast.success("Copied"))}><CopyIcon /></Button>
                </div>
                <DialogFooter>
                  <Button onClick={() => { setCreateOpen(false); setTempPassword(null); }}>Done</Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={createStaff} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="staff-name">Full name <span className="text-destructive">*</span></Label>
                  <Input id="staff-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="staff-email">Email <span className="text-destructive">*</span></Label>
                  <Input id="staff-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required placeholder="name@clothflow.rw" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="staff-role">Role</Label>
                  <NativeSelect id="staff-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                    {Object.entries(ROLE_LABELS).filter(([id]) => id !== "owner").map(([id, label]) => <NativeSelectOption key={id} value={id}>{label}</NativeSelectOption>)}
                    <NativeSelectOption value="owner">Owner (full access)</NativeSelectOption>
                  </NativeSelect>
                </div>
                {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create account"}</Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Confirmation dialog */}
        <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirm?.action === "reset" ? "Reset password?" : confirm?.action === "deactivate" ? "Deactivate account?" : confirm?.action === "delete" ? "Delete account?" : "Reactivate account?"}
              </DialogTitle>
              <DialogDescription>
                {confirm?.action === "reset"
                  ? `A new temporary password will be generated for ${confirm?.user.name} and all their sessions revoked.`
                  : confirm?.action === "deactivate"
                    ? `${confirm?.user.name} will be signed out everywhere and blocked from signing in. This is not a delete — their history is preserved.`
                    : confirm?.action === "delete"
                      ? `${confirm?.user.name}'s account will be permanently deleted. Only possible while the account has no store activity (sales, stock, audit) — otherwise it must be deactivated.`
                      : `${confirm?.user.name} will be able to sign in again.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant={confirm?.action === "deactivate" || confirm?.action === "delete" ? "destructive" : "default"} onClick={runConfirm}>
                {confirm?.action === "reset" ? <KeyRoundIcon aria-hidden /> : confirm?.action === "deactivate" ? <UserXIcon aria-hidden /> : confirm?.action === "delete" ? <Trash2Icon aria-hidden /> : <UserCheckIcon aria-hidden />}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGate>
  );
}

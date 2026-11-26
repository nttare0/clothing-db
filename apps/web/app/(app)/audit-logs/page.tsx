"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollTextIcon, SearchIcon, ChevronRightIcon } from "lucide-react";
import { api, ApiError, formatDateTime } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlert, EmptyState } from "@/components/state";
import { RoleGate } from "@/components/role-gate";

type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  requestId: string | null;
};

type AuditDetail = AuditRow & {
  before_data: unknown;
  after_data: unknown;
};

const PAGE_SIZE = 30;

export default function AuditLogsPage() {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AuditRow[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query.trim()) q.set("search", query.trim());
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    api<{ items: AuditRow[]; total: number }>(`/audit-logs?${q.toString()}`)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Could not load audit logs."),
      )
      .finally(() => setLoading(false));
  }, [query, from, to, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function openDetail(row: AuditRow) {
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = await api<AuditDetail>(`/audit-logs/${row.id}`);
      setDetail(r);
    } catch {
      setDetail({ ...row, before_data: null, after_data: null });
    } finally {
      setDetailLoading(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <RoleGate allow={["owner"]}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl"><ScrollTextIcon className="size-6" aria-hidden /> Audit log</h1>
          <p className="text-sm text-muted-foreground">Append-only record of every sensitive action — price changes, voids, permission edits, adjustments.</p>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" aria-label="Search audit log" placeholder="Search action, entity or staff name…" className="pl-9" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          </div>
          <Input type="date" aria-label="From date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <Input type="date" aria-label="To date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>

        {error ? <ErrorAlert message={error} onRetry={load} /> : null}

        {loading ? (
          <Card><CardContent className="flex flex-col gap-2 pt-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card>
        ) : data && data.items.length === 0 ? (
          <EmptyState title="No events" description="Sensitive actions will appear here as the store is used." />
        ) : data ? (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Details</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4 text-sm text-muted-foreground">{formatDateTime(row.createdAt)}</TableCell>
                    <TableCell className="text-sm">{row.actorName ?? <span className="text-muted-foreground">System</span>}</TableCell>
                    <TableCell className="font-mono text-xs">{row.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.entityType}{row.entityId ? <span className="ml-1 font-mono">{row.entityId.slice(0, 8)}</span> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" aria-label="View details" onClick={() => openDetail(row)}><ChevronRightIcon /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between gap-2 border-t border-border p-3 text-sm">
              <span className="text-muted-foreground">{data.total} event{data.total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2">
                <button className="rounded-md border border-border px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <span className="tabular-nums text-muted-foreground">{page} / {totalPages}</span>
                <button className="rounded-md border border-border px-2 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </Card>
        ) : null}

        <Dialog open={detailLoading || detail !== null} onOpenChange={(open) => { if (!open) setDetail(null); }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-mono text-base">{detail?.action ?? "Loading…"}</DialogTitle>
              <DialogDescription>
                {detail ? `${detail.actorName ?? "System"} · ${formatDateTime(detail.createdAt)}${detail.requestId ? ` · request ${detail.requestId}` : ""}` : ""}
              </DialogDescription>
            </DialogHeader>
            {detailLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : detail ? (
              <div className="grid gap-3">
                {(["before_data", "after_data"] as const).map((key) => (
                  <div key={key}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{key === "before_data" ? "Before" : "After"}</p>
                    <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed">
                      {detail[key] === null || detail[key] === undefined ? "—" : JSON.stringify(detail[key], null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </RoleGate>
  );
}

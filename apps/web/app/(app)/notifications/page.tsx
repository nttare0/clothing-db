"use client";

import { useCallback, useEffect, useState } from "react";
import { BellIcon, CircleCheckIcon, CheckCheckIcon, Trash2Icon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { api, ApiError, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorAlert, EmptyState } from "@/components/state";

type Notification = {
  id: string;
  createdAt: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  actionLabel: string | null;
  actionHref: string | null;
  readAt: string | null;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api<{ items: Notification[] }>("/notifications")
      .then((r) => setItems(r.items))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load your notifications. Check your internet connection and try again."),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markAllRead() {
    setWorking(true);
    try {
      await api("/notifications/read-all", { method: "POST" });
      setItems((rows) => rows?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't mark them as read. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  async function dismiss(id: string) {
    try {
      await api(`/notifications/${id}`, { method: "DELETE" });
      setItems((rows) => rows?.filter((n) => n.id !== id) ?? rows);
    } catch {
      /* keep it visible; user can retry */
    }
  }

  const unread = items?.filter((n) => !n.readAt).length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Notifications</h1>
          <p className="text-sm text-muted-foreground">Low stock, failed receipts and system messages.</p>
        </div>
        {unread > 0 ? (
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={working}>
            <CheckCheckIcon aria-hidden /> Mark all read ({unread})
          </Button>
        ) : null}
      </div>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {items === null && !error ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : items && items.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          description="Nothing needs your attention right now."
        />
      ) : items ? (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <Card className={n.readAt ? "opacity-70" : "border-primary/40"}>
                <CardContent className="flex items-start gap-3 pt-2">
                  <BellIcon className={`mt-0.5 size-5 shrink-0 ${n.severity === "critical" ? "text-destructive" : n.severity === "warning" ? "text-amber-600" : "text-muted-foreground"}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{n.title}</p>
                      {!n.readAt ? <span className="size-2 rounded-full bg-primary" aria-label="Unread" /> : null}
                      <Badge variant={n.severity === "critical" ? "destructive" : n.severity === "warning" ? "warning" : "secondary"} className="text-[10px] uppercase">
                        {n.severity}
                      </Badge>
                    </div>
                    {n.body ? <p className="mt-1 text-sm text-muted-foreground">{n.body}</p> : null}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <time>{formatDateTime(n.createdAt)}</time>
                      {n.actionHref ? (
                        <Link href={n.actionHref} className="flex items-center gap-1 font-medium text-primary hover:underline">
                          {n.actionLabel ?? "View"} <ExternalLinkIcon className="size-3" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => dismiss(n.id)} aria-label="Dismiss notification">
                    <Trash2Icon />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="flex items-center gap-1.5 text-center text-[11px] text-muted-foreground">
        <CircleCheckIcon className="size-3.5" aria-hidden /> Notifications are generated by the system; dismissals are personal to you.
      </p>
    </div>
  );
}

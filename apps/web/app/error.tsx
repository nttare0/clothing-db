"use client";

import { useEffect } from "react";
import { ShirtIcon, RefreshCwIcon, HomeIcon } from "lucide-react";
import { errorReference, isChunkError, reloadOnceForChunkError } from "@/lib/error-reference";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunk = isChunkError(error);
  const reference = errorReference(error);

  useEffect(() => {
    console.error("Route error boundary:", error);
    reloadOnceForChunkError(error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShirtIcon className="size-7" aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">
          {chunk ? "ClothFlow was just updated" : "Something went wrong"}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {chunk ? (
            <>A new version was deployed while this page was open. Reloading gets you the latest screens — your work is not lost.</>
          ) : (
            <>
              The page hit an unexpected error. Your work in other tabs is safe. If this keeps happening,
              quote this reference to support:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{reference}</code>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {chunk ? (
          <button
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCwIcon className="size-4" aria-hidden /> Reload now
          </button>
        ) : (
          <button
            onClick={reset}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCwIcon className="size-4" aria-hidden /> Try again
          </button>
        )}
        <a
          href="/dashboard"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
        >
          <HomeIcon className="size-4" aria-hidden /> Dashboard
        </a>
      </div>
    </main>
  );
}

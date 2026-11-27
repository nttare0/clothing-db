"use client";

import { useEffect } from "react";
import { ShirtIcon, RefreshCwIcon } from "lucide-react";
import { errorReference, isChunkError, reloadOnceForChunkError } from "@/lib/error-reference";

/** Error boundary for the authenticated app shell area. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunk = isChunkError(error);
  const reference = errorReference(error);

  useEffect(() => {
    console.error("App route error:", error);
    reloadOnceForChunkError(error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShirtIcon className="size-7" aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">
          {chunk ? "ClothFlow was just updated" : "This screen couldn&apos;t load"}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {chunk ? (
            "A new version was deployed while this page was open. Reloading gets you the latest screens — your work is not lost."
          ) : (
            <>
              Your data is safe — the screen hit an unexpected error. Try again, and if it fails twice,
              quote this reference to your administrator:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{reference}</code>
            </>
          )}
        </p>
      </div>
      <button
        onClick={chunk ? () => window.location.reload() : reset}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <RefreshCwIcon className="size-4" aria-hidden /> {chunk ? "Reload now" : "Try again"}
      </button>
    </main>
  );
}

"use client";

import { useEffect } from "react";
import Image from "next/image";
import { RefreshCwIcon, AlertTriangleIcon, HomeIcon } from "lucide-react";
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
  // Production strips server-side messages down to a safe generic string, so this is safe to show.
  const message = error?.message?.trim() || "Unknown error";

  useEffect(() => {
    console.error("App route error:", error);
    reloadOnceForChunkError(error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Image
        src="/illustrations/something-wrong.png"
        alt="A tangled spool of blue thread with a sewing needle and an unstitched button"
        width={880}
        height={480}
        className="w-full max-w-[16rem] rounded-2xl object-cover sm:max-w-xs"
      />
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">
          {chunk ? "ClothFlow was just updated" : "This screen couldn\u2019t load"}
        </h1>
        {chunk ? (
          <p className="text-sm text-muted-foreground">
            A new version was deployed while this page was open. Reloading gets you the latest screens — your work is not lost.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Your data is safe — the screen hit an unexpected error.</p>
            <div
              role="alert"
              className="flex w-full items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-left"
            >
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <p className="min-w-0 break-words font-mono text-xs leading-relaxed text-destructive">{message}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Try again — if it fails twice, quote this reference to your administrator:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{reference}</code>
            </p>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={chunk ? () => window.location.reload() : reset}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <RefreshCwIcon className="size-4" aria-hidden /> {chunk ? "Reload now" : "Try again"}
        </button>
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

"use client";

import { errorReference, isChunkError, reloadOnceForChunkError } from "@/lib/error-reference";
import { useEffect } from "react";

/**
 * Last-resort boundary for failures in the root layout itself.
 * Deliberately dependency-free (inline styles, no CSS/JS imports) so it renders
 * even when the app bundle is broken. The illustration is a static public asset.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunk = isChunkError(error);
  const reference = errorReference(error);
  const message = error?.message?.trim() || "Unknown error";

  useEffect(() => {
    console.error("Global error boundary:", error);
    reloadOnceForChunkError(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f5f7fb", color: "#172033" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/something-wrong.png"
            alt="A tangled spool of blue thread with a sewing needle and an unstitched button"
            style={{ width: "100%", maxWidth: 300, borderRadius: 16, objectFit: "cover" }}
          />
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Oh dear — ClothFlow hit a snag</h1>
          {chunk ? (
            <p style={{ fontSize: 14, color: "#475569", maxWidth: 420, margin: 0 }}>
              A new version of ClothFlow was deployed while this page was open. Reloading gets you the latest screens.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 14, color: "#475569", maxWidth: 420, margin: 0 }}>
                ClothFlow could not start up properly. Try again — if this keeps happening, show this reference to the store administrator:{" "}
                <code style={{ background: "#e2e8f0", borderRadius: 6, padding: "2px 6px", fontSize: 12 }}>{reference}</code>
              </p>
              <p
                role="alert"
                style={{ fontSize: 12, color: "#e40014", background: "#fdf0f0", border: "1px solid #f6c8c8", borderRadius: 8, padding: "8px 12px", maxWidth: 440, wordBreak: "break-word", margin: 0, textAlign: "left", fontFamily: "ui-monospace, monospace" }}
              >
                {message}
              </p>
            </>
          )}
          <button
            onClick={chunk ? () => window.location.reload() : reset}
            style={{ height: 40, padding: "0 18px", borderRadius: 8, border: 0, background: "#3157d5", color: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            {chunk ? "Reload now" : "Try again"}
          </button>
        </main>
      </body>
    </html>
  );
}

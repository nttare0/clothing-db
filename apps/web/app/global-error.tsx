"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#fafaf9", color: "#1c1917" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>ClothFlow hit a critical error</h1>
          <p style={{ fontSize: 14, color: "#57534e", maxWidth: 420, margin: 0 }}>
            The app could not render at all. Try again — if it persists, quote this reference to support:{" "}
            <code style={{ background: "#e7e5e4", borderRadius: 6, padding: "2px 6px", fontSize: 12 }}>{error.digest ?? "no-reference"}</code>
          </p>
          <button
            onClick={reset}
            style={{ height: 40, padding: "0 18px", borderRadius: 8, border: 0, background: "#1c1917", color: "#fafaf9", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

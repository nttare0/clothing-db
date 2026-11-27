export default function AppLoading() {
  // Shown while a section's server payload streams in — keeps navigation from feeling stuck.
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6" role="status" aria-busy="true" aria-label="Loading page">
      <div className="flex items-center justify-between gap-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

// References shown on error screens. Server-rendered failures carry a digest that
// matches server logs; client-side failures (no digest) get a stable hash of the
// error itself, so repeat reports of the same bug converge on one reference
// instead of a useless random-looking string.

export function errorReference(error: Error & { digest?: string }): string {
  if (error.digest) return error.digest;

  const input = `${error.name}:${error.message}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return `client-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * True when the error is a stale-build chunk failure (the page was opened against
 * an old deployment and the chunks it asks for no longer exist). These recover
 * with a single reload, so boundaries auto-reload once per session.
 */
export function isChunkError(error: Error): boolean {
  const message = error.message ?? "";
  return (
    error.name === "ChunkLoadError" ||
    /loading (css )?chunk [\w-]+ failed/i.test(message) ||
    /failed to fetch dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message)
  );
}

const RELOAD_KEY = "clothflow-chunk-reload";

/** Auto-reload once per session for chunk errors. Returns true when a reload was triggered. */
export function reloadOnceForChunkError(error: Error): boolean {
  if (!isChunkError(error)) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — try the reload anyway, but only once per mount.
  }
  window.location.reload();
  return true;
}

// Tiny module-level cache for GET /api responses.
// Navigating away and back within the TTL renders instantly from memory;
// every successful mutation clears the whole cache so data is never stale
// after a change the user made themselves.
export type ApiCacheEntry = { data: unknown; stored: number };

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;
const cache = new Map<string, ApiCacheEntry>();

export function clearApiCache(): void {
  cache.clear();
}

export function readApiCache(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.stored > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.data;
}

export function writeApiCache(key: string, data: unknown): void {
  if (cache.size >= MAX_ENTRIES) clearApiCache();
  cache.set(key, { data, stored: Date.now() });
}

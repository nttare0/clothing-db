import { clearApiCache, readApiCache, writeApiCache } from "./api-cache";
import { isDemoActive, markDemoWorked, setDemoActive } from "./demo-state";
import { demoApiGet, demoCompletedSale } from "./demo-fixtures";

export type ApiErrorShape = { code: string; message: string; requestId?: string; retryAfter?: number; attemptsLeft?: number };

export class ApiError extends Error {
  code: string;
  status: number;
  requestId?: string;
  /** Seconds until the lockout expires (only on 429 LOCKED responses). */
  retryAfter?: number;
  /** Wrong-password attempts left before the 60-second lock. */
  attemptsLeft?: number;

  constructor(status: number, shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.status = status;
    this.code = shape.code;
    this.requestId = shape.requestId;
    this.retryAfter = shape.retryAfter;
    this.attemptsLeft = shape.attemptsLeft;
  }
}

/** Runtime escape hatch for the demo banner / layout — re-exported for convenience. */
export { setDemoActive };

/** Paths that should never trip the "user started working" demo exit. */
const DEMO_NEUTRAL_PREFIXES = ["/auth/", "/demo/", "/notifications/"];

function looksLikeDemoIdPath(path: string): boolean {
  return /de000000-/.test(path);
}

/**
 * Client-side wrapper around the ClothFlow API.
 * All requests are same-origin (/api/*) and proxied to the API service;
 * the browser never carries credentials cross-origin.
 */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const demo = isDemoActive();

  // ----- demo mode: serve fixtures for reads, simulate writes that would be invalid -----
  if (demo) {
    if (method === "GET") {
      const fixture = demoApiGet(path);
      if (fixture !== undefined) return fixture as T;
      // no fixture → fall through to the real API (settings, staff, audit)
    } else {
      if (path === "/sales" && method === "POST") {
        const receipt = demoCompletedSale(options.body);
        markDemoWorked(); // the owner completed their first (demo) sale — demo ends here
        return receipt as T;
      }
      if (path.startsWith("/notifications/")) {
        return { ok: true } as T; // demo notifications are read-state local noise
      }
    }
  }

  // ----- GET cache (fresh within 60s; cleared by any successful mutation) -----
  const cacheKey = `${method}:${path}`;
  if (method === "GET") {
    const cached = readApiCache(cacheKey);
    if (cached !== undefined) return cached as T;
  }

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, {
      code: "NETWORK_ERROR",
      message: "We can't reach the server right now. Please check your internet connection and try again.",
    });
  }

  let payload: { data?: T; error?: ApiErrorShape } | null = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON response (e.g. proxy/HTML error page)
  }

  if (res.status === 401 && typeof window !== "undefined") {
    // Bounce the whole app to the re-auth screen — but never leave the caller
    // hanging on a promise that never settles. Reject so UI error/loading
    // states resolve; the navigation wins the race anyway.
    try {
      // Full document navigation is deliberate: the current JS bundle may be the
      // very thing that died, and there is no router inside this module.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/session-expired");
    } catch {
      // non-navigable context — fall through to the typed error
    }
    throw new ApiError(401, { code: "SESSION_EXPIRED", message: "Your session has expired. Sign in again." });
  }

  if (!res.ok || (payload && payload.error)) {
    const shape = payload?.error ?? {
      code: `HTTP_${res.status}`,
      message: "That didn't work. Please try again.",
    };
    throw new ApiError(res.status, shape);
  }

  const data = (payload?.data ?? (payload as unknown)) as T;

  if (method === "GET") {
    writeApiCache(cacheKey, data);
  } else {
    clearApiCache();
    // Any successful real mutation ends the demo (markDemoWorked is a no-op
    // when the demo was already off).
    if (!DEMO_NEUTRAL_PREFIXES.some((prefix) => path.startsWith(prefix)) && !looksLikeDemoIdPath(path)) {
      markDemoWorked();
    }
  }

  return data;
}

export function formatRWF(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  if (Number.isNaN(n)) return "RWF 0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

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

/**
 * Client-side wrapper around the ClothFlow API.
 * All requests are same-origin (/api/*) and proxied to the API service;
 * the browser never carries credentials cross-origin.
 */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, {
      code: "NETWORK_ERROR",
      message: "Could not reach the server. Check the connection and try again.",
    });
  }

  let payload: { data?: T; error?: ApiErrorShape } | null = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON response (e.g. proxy/HTML error page)
  }

  if (res.status === 401 && typeof window !== "undefined") {
    window.location.assign("/session-expired");
    // keep waiting; navigation will unload the page
    return new Promise<T>(() => {});
  }

  if (!res.ok || (payload && payload.error)) {
    const shape = payload?.error ?? {
      code: `HTTP_${res.status}`,
      message: "Something went wrong. Please try again.",
    };
    throw new ApiError(res.status, shape);
  }

  return (payload?.data ?? (payload as unknown)) as T;
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

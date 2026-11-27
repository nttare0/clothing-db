// Tiny in-memory fixed-window rate limiter.
// Honest limitation: on serverless, state is per instance, so this throttles bursts
// rather than providing a hard global cap. A shared store (Redis) is the follow-up
// if the owner needs strict limits across instances.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

// Periodic sweep so the map does not grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

// ---------- Sign-in failure lockout ----------
// 5 consecutive wrong passwords for an account locks it for 60 seconds.
// In-memory per instance (see note at the top) — a shared store is the follow-up
// for strict limits across serverless instances.
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 60_000;

type FailureBucket = { count: number; windowStart: number; blockedUntil: number };
const failures = new Map<string, FailureBucket>();

function bucketFor(key: string, now: number): FailureBucket {
  const existing = failures.get(key);
  if (existing && existing.windowStart + FAIL_WINDOW_MS > now) return existing;
  const fresh: FailureBucket = { count: 0, windowStart: now, blockedUntil: 0 };
  failures.set(key, fresh);
  return fresh;
}

/** Seconds remaining on the lock, or null when the account is not locked. */
export function signinLockSeconds(key: string): number | null {
  const b = failures.get(key);
  if (!b) return null;
  const remaining = b.blockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : null;
}

/** Record a wrong password. Returns lock state for the response. */
export function recordSigninFailure(key: string): { blocked: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  const b = bucketFor(key, now);
  b.count += 1;
  if (b.count >= FAIL_LIMIT) {
    b.blockedUntil = now + BLOCK_MS;
    b.count = 0; // after the lock expires the user gets a fresh set of attempts
    return { blocked: true, retryAfter: Math.ceil(BLOCK_MS / 1000), remaining: 0 };
  }
  return { blocked: false, retryAfter: 0, remaining: FAIL_LIMIT - b.count };
}

/** Clear failures after a successful sign-in. */
export function clearSigninFailures(key: string): void {
  failures.delete(key);
}

/**
 * Small in-memory rate limiter for login, password reset, sign-up, and public
 * uploads. Per process, so on Vercel it is per warm instance; good enough to
 * blunt password guessing and upload floods, not a substitute for a WAF.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  if (process.env.DISABLE_RATE_LIMIT === "1") return { ok: true, retryAfterSec: 0 }; // browser tests sign in many times
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return { ok: true, retryAfterSec: 0 };
  }
  b.count++;
  if (b.count > max) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}

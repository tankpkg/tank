/**
 * In-memory rate limiter for the public scan API.
 *
 * Tracks request counts per key (IP or user ID) within a sliding window.
 * Suitable for single-instance deployments. For multi-replica, use Redis.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private maxRequests: number,
    private windowSeconds = 3600
  ) {}

  check(key: string): { allowed: boolean; remaining: number; retryAfter: number } {
    const now = Date.now() / 1000;
    const bucket = this.buckets.get(key);

    if (!bucket) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.maxRequests - 1, retryAfter: 0 };
    }

    const elapsed = now - bucket.windowStart;

    if (elapsed >= this.windowSeconds) {
      bucket.count = 1;
      bucket.windowStart = now;
      return { allowed: true, remaining: this.maxRequests - 1, retryAfter: 0 };
    }

    if (bucket.count >= this.maxRequests) {
      const retryAfter = Math.ceil(this.windowSeconds - elapsed);
      return { allowed: false, remaining: 0, retryAfter };
    }

    bucket.count++;
    return { allowed: true, remaining: this.maxRequests - bucket.count, retryAfter: 0 };
  }

  /** Remove expired buckets to prevent memory leaks. */
  cleanup(maxAgeSeconds = 7200): number {
    const now = Date.now() / 1000;
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart > maxAgeSeconds) {
        this.buckets.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

// Pre-configured rate limiters
export const anonymousLimiter = new RateLimiter(3, 3600); // 3/hr
export const authFreeLimiter = new RateLimiter(20, 3600); // 20/hr
export const authProLimiter = new RateLimiter(200, 3600); // 200/hr

// Periodic cleanup every 30 minutes to prevent unbounded memory growth
if (typeof setInterval !== 'undefined') {
  const handle = setInterval(
    () => {
      anonymousLimiter.cleanup();
      authFreeLimiter.cleanup();
      authProLimiter.cleanup();
    },
    30 * 60 * 1000
  );
  handle.unref?.(); // Don't prevent process exit
}

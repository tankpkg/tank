import { rateLimiter } from 'hono-rate-limiter';
import type { Context } from 'hono';

// In-memory store (default). For multi-instance deployments, swap to RedisStore
// from hono-rate-limiter with an ioredis adapter.
export function createRateLimiter() {
  return rateLimiter({
    windowMs: 60 * 1000,
    limit: 100,
    keyGenerator: (c: Context) => {
      const apiKeyId = c.req.header('authorization')?.slice(7) || '';
      return apiKeyId || c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    },
  });
}

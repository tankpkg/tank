import { describe, expect, it } from 'vitest';

import { PUBLIC_SKILL_READ_CACHE_CONTROL, publicSkillReadCacheControl } from './public-read-cache';

/**
 * Regression: `GET /api/v1/skills/:name` shipped `max-age=0, must-revalidate`, so
 * neither Vercel's edge nor Cloudflare cached it. Every request — and every SDK
 * retry — invoked the function and hit Postgres, exhausting the Supabase pooler
 * (EMAXCONN, limit 200) and timing out, which surfaced to callers as
 * "Tank network error after 6 attempts". A positive shared-cache TTL fixes it.
 */
describe('publicSkillReadCacheControl', () => {
  it('gives anonymous reads a shared-cacheable directive with a positive s-maxage so CDNs serve repeated/retried fetches without hitting Postgres', () => {
    const cc = publicSkillReadCacheControl(null);
    expect(cc).not.toBeNull();
    expect(cc).toContain('public');
    // The bug was a zero shared TTL. A shared cache (Vercel/Cloudflare) only stores
    // the response when s-maxage is present and > 0.
    const sMaxAge = Number(/s-maxage=(\d+)/.exec(cc ?? '')?.[1]);
    expect(sMaxAge).toBeGreaterThan(0);
  });

  it('does NOT emit a shared-cache directive for authenticated reads (responses use per-requester visibility and could include private skills)', () => {
    expect(publicSkillReadCacheControl('user_123')).toBeNull();
    expect(publicSkillReadCacheControl(undefined)).not.toBeNull(); // undefined = anonymous
  });

  it('keeps browsers revalidating while letting shared caches serve stale during revalidation', () => {
    expect(PUBLIC_SKILL_READ_CACHE_CONTROL).toContain('max-age=0');
    expect(PUBLIC_SKILL_READ_CACHE_CONTROL).toContain('stale-while-revalidate=');
  });
});

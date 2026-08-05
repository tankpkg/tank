import { describe, expect, it } from 'vitest';

import {
  PUBLIC_SKILL_READ_CACHE_CONTROL,
  PUBLIC_SKILL_READ_CDN_CACHE_CONTROL,
  publicSkillReadCacheHeaders,
  requestIsAnonymous
} from './public-read-cache';

/**
 * Regression: `GET /api/v1/skills/:name` shipped `max-age=0, must-revalidate`, so
 * neither Vercel's edge nor Cloudflare cached it. Every request — and every SDK
 * retry — invoked the function and hit Postgres, exhausting the Supabase pooler
 * (EMAXCONN, limit 200) and timing out, which surfaced to callers as
 * "Tank network error after 6 attempts". Positive shared-cache TTLs fix it.
 */
describe('publicSkillReadCacheHeaders', () => {
  it('gives anonymous reads shared-cacheable headers with a positive s-maxage so both CDN layers serve repeated/retried fetches without hitting Postgres', () => {
    const headers = publicSkillReadCacheHeaders(null);
    expect(headers).not.toBeNull();
    // Vercel edge caches via Cache-Control s-maxage.
    expect(headers?.['Cache-Control']).toContain('public');
    expect(Number(/s-maxage=(\d+)/.exec(headers?.['Cache-Control'] ?? '')?.[1])).toBeGreaterThan(0);
    // Cloudflare sits in front of Vercel (which strips s-maxage from Cache-Control),
    // so it needs its own vendor header to cache /api/* — also with a positive s-maxage.
    expect(headers?.['Cloudflare-CDN-Cache-Control']).toContain('public');
    expect(Number(/s-maxage=(\d+)/.exec(headers?.['Cloudflare-CDN-Cache-Control'] ?? '')?.[1])).toBeGreaterThan(0);
  });

  it('does NOT emit shared-cache headers for authenticated reads (responses use per-requester visibility and could include private skills)', () => {
    expect(publicSkillReadCacheHeaders('user_123')).toBeNull();
    expect(publicSkillReadCacheHeaders(undefined)).not.toBeNull(); // undefined = anonymous
  });

  it('keeps browsers revalidating while letting shared caches serve stale during revalidation', () => {
    expect(PUBLIC_SKILL_READ_CACHE_CONTROL).toContain('max-age=0');
    expect(PUBLIC_SKILL_READ_CACHE_CONTROL).toContain('stale-while-revalidate=');
    // The Cloudflare directive is shared-cache only — it must not pin browser caches.
    expect(PUBLIC_SKILL_READ_CDN_CACHE_CONTROL).not.toContain('max-age=0');
    expect(PUBLIC_SKILL_READ_CDN_CACHE_CONTROL).toContain('stale-while-revalidate=');
  });
});

/**
 * Under a retry storm, resolving a user id for a request that carries NO
 * credential still queries auth/Postgres before we can decide the response is
 * shared-cacheable. `requestIsAnonymous` lets read routes short-circuit that:
 * a credential-free request can only see public data, so we serve it a cacheable
 * response without touching the exhausted pooler.
 */
describe('requestIsAnonymous', () => {
  const req = (headers: Record<string, string>) => new Request('https://www.tankpkg.dev/api/v1/skills/x', { headers });

  it('is true for a request with no Authorization header and no cookie', () => {
    expect(requestIsAnonymous(req({}))).toBe(true);
  });

  it('is false when an Authorization header is present (CLI/API token)', () => {
    expect(requestIsAnonymous(req({ authorization: 'Bearer tok_123' }))).toBe(false);
  });

  it('is false when a cookie is present (possible browser session)', () => {
    expect(requestIsAnonymous(req({ cookie: 'better-auth.session_token=abc' }))).toBe(false);
  });

  it('treats blank credential headers as anonymous', () => {
    expect(requestIsAnonymous(req({ authorization: '   ', cookie: '' }))).toBe(true);
  });
});

/**
 * Cache-Control for the public skill-read API (`GET /api/v1/skills/:name`,
 * `/:name/versions`).
 *
 * Incident: these endpoints shipped `max-age=0, must-revalidate`, so no shared
 * cache stored them. Every request — and every SDK retry (6 attempts with
 * backoff) — invoked the serverless function and ran a Postgres query, which
 * exhausted the Supabase transaction pooler's client-connection limit
 * (`EMAXCONN`, limit 200) and hit statement/function timeouts. Callers saw
 * "Tank network error after N attempts" for a skill that was actually healthy.
 *
 * A positive `s-maxage` lets shared caches serve repeated + retried fetches
 * without touching Postgres, while `max-age=0` keeps browsers revalidating and
 * `stale-while-revalidate` avoids a thundering herd when an entry expires.
 *
 * Two CDN layers sit in front of this origin: Cloudflare → Vercel. Vercel
 * *consumes* `s-maxage` from `Cache-Control` for its edge cache and strips it
 * before responding, so Cloudflare would only ever see `max-age=0`. To let
 * Cloudflare cache `/api/*` too (once a matching cache rule is enabled), we also
 * emit `Cloudflare-CDN-Cache-Control`, a vendor header Vercel passes through
 * untouched and Cloudflare honors with the highest precedence.
 *
 * Apply ONLY to anonymous responses: authenticated reads use per-requester
 * visibility (they may include private skills) and must never be shared-cached.
 */
const SHARED_MAX_AGE_SECONDS = 60;
const STALE_WHILE_REVALIDATE_SECONDS = 300;

/** `Cache-Control` — browsers revalidate (`max-age=0`); Vercel's edge caches via `s-maxage`. */
export const PUBLIC_SKILL_READ_CACHE_CONTROL = `public, max-age=0, s-maxage=${SHARED_MAX_AGE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`;

/** Cloudflare-only edge directive (Vercel forwards it verbatim; Cloudflare caches with a rule). */
export const PUBLIC_SKILL_READ_CDN_CACHE_CONTROL = `public, s-maxage=${SHARED_MAX_AGE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`;

/**
 * Cache headers for a skill-read response, or `null` when the request is
 * authenticated (per-requester data must not be stored in a shared cache).
 */
export function publicSkillReadCacheHeaders(requesterUserId: string | null | undefined): Record<string, string> | null {
  if (requesterUserId) return null;
  return {
    'Cache-Control': PUBLIC_SKILL_READ_CACHE_CONTROL,
    'Cloudflare-CDN-Cache-Control': PUBLIC_SKILL_READ_CDN_CACHE_CONTROL
  };
}

/**
 * True when a request carries no credential at all — no `Authorization: Bearer`
 * token and no auth session/CSRF cookie. Such requests can only ever see public
 * data, so read routes can serve them a shared-cacheable response WITHOUT first
 * resolving a user id (which itself queries the DB/auth). Under a retry storm,
 * skipping that resolution keeps anonymous reads off the exhausted pooler.
 *
 * Conservative by design: if any cookie or Authorization header is present we
 * treat the request as potentially authenticated and fall back to real
 * resolution, so we never leak private data into a shared cache.
 */
export function requestIsAnonymous(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.trim().length > 0) return false;
  const cookie = request.headers.get('cookie');
  if (cookie && cookie.trim().length > 0) return false;
  return true;
}

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
 * without touching Postgres (Vercel's edge honors it today; Cloudflare will too
 * once a cache rule makes `/api/*` eligible). `max-age=0` keeps browsers
 * revalidating, and `stale-while-revalidate` avoids a thundering herd back to
 * the origin when an entry expires.
 *
 * Apply ONLY to anonymous responses: authenticated reads use per-requester
 * visibility (they may include private skills) and must never be stored in a
 * shared cache.
 */
export const PUBLIC_SKILL_READ_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

/**
 * Returns the Cache-Control value for a skill-read response, or `null` when the
 * request is authenticated (per-requester data must not be shared-cached).
 */
export function publicSkillReadCacheControl(requesterUserId: string | null | undefined): string | null {
  return requesterUserId ? null : PUBLIC_SKILL_READ_CACHE_CONTROL;
}

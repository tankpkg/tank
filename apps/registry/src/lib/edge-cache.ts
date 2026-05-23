import { setResponseHeader } from '@tanstack/react-start/server';

/**
 * Vercel-only edge cache directive: cached on the Vercel CDN for `sMaxAge` seconds,
 * served stale for up to `staleWhileRevalidate` while a fresh fetch runs in the
 * background. Browsers are told `max-age=0, must-revalidate` so client navigation
 * still hits the (cached) edge but does not pin stale data locally.
 *
 * Use ONLY on server functions whose response does NOT depend on the requester
 * (no auth headers, no per-user data). For mixed-auth endpoints, set this only
 * on the unauthenticated branch.
 */
export function setEdgeCache(sMaxAge: number, staleWhileRevalidate: number = sMaxAge * 12): void {
  try {
    setResponseHeader('CDN-Cache-Control', `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
    setResponseHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  } catch {
    // Outside a request context (e.g. test-time) — no-op.
  }
}

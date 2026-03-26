import type { Context } from 'hono';
import { env } from '~/consts/env';

/**
 * Returns the live APP_URL, reading from process.env (hydrated by
 * bootstrap/setup wizard) instead of the frozen `env` object.
 *
 * For Hono handlers, pass the Context to derive the URL from request
 * headers as a fallback — resilient even when env is misconfigured
 * (common in on-prem deployments behind a reverse proxy).
 *
 * Fallback chain:
 *   1. process.env.BETTER_AUTH_URL / process.env.APP_URL (live, non-localhost)
 *   2. Request headers: X-Forwarded-Proto + X-Forwarded-Host / Host (if Context provided)
 *   3. process.env values even if localhost (dev environment)
 *   4. Frozen env.APP_URL (last resort)
 */
export function getAppUrl(c?: Context): string {
  const live = process.env.BETTER_AUTH_URL || process.env.APP_URL;

  if (live && !isLocalhost(live)) return live;

  if (c) {
    const proto = c.req.header('x-forwarded-proto') || 'https';
    const host = c.req.header('x-forwarded-host') || c.req.header('host');
    if (host && !isLocalhost(host)) return `${proto}://${host.replace(/\/$/, '')}`;
  }

  if (live) return live;

  return env.APP_URL;
}

function isLocalhost(value: string): boolean {
  return value.includes('localhost') || value.includes('127.0.0.1');
}

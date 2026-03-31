/**
 * POST /api/v1/scan — Public security scan endpoint.
 *
 * Accepts a tarball URL, validates it (SSRF protection), rate-limits,
 * proxies to the Python scanner, and returns the scan report synchronously.
 */

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '~/consts/env';
import { resolveRequestUserId } from '~/lib/auth/authz';
import { validateScanUrl } from '~/lib/scan/url-validator';
import { anonymousLimiter, authFreeLimiter } from '../../middleware/rate-limit';

import { getLog } from '~/lib/log';
const log = getLog('scan:public');

const scanSchema = z.object({
  url: z.string().url().max(2048)
});

export const scanRoutes = new Hono().post('/', zValidator('json', scanSchema), async (c) => {
  const { url } = c.req.valid('json');

  // Step 1: URL validation (SSRF protection)
  const urlValidation = validateScanUrl(url);
  if (!urlValidation.valid) {
    return c.json({ error: urlValidation.error }, 400);
  }

  // Step 2: Rate limiting
  const userId = await resolveRequestUserId(c.req.raw);
  const limiter = userId ? authFreeLimiter : anonymousLimiter;
  const rateKey = userId ?? c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
  const { allowed, remaining, retryAfter } = limiter.check(rateKey);

  if (!allowed) {
    c.header('Retry-After', String(retryAfter));
    return c.json({ error: 'Rate limit exceeded', retryAfter }, 429);
  }

  c.header('X-RateLimit-Remaining', String(remaining));

  // Step 3: Validate scanner is configured
  const scanApiUrl = env.PYTHON_API_URL;
  if (!scanApiUrl) {
    return c.json({ error: 'Scanner service not configured' }, 503);
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (env.SCANNER_SERVICE_KEY) {
      headers['X-Scanner-Key'] = env.SCANNER_SERVICE_KEY;
    }

    const scanResponse = await fetch(`${scanApiUrl}/api/analyze/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tarball_url: url,
        version_id: `public-scan-${crypto.randomUUID()}`,
        manifest: {},
        permissions: {}
      }),
      signal: AbortSignal.timeout(55_000) // 55s max
    });

    if (!scanResponse.ok) {
      const errorText = await scanResponse.text().catch(() => 'Unknown error');
      return c.json({ error: 'Scanner error', details: errorText }, 502);
    }

    const scanResult = await scanResponse.json();
    return c.json(scanResult);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      log.warn('Public scan timed out', { url });
      return c.json({ error: 'Scan timed out (55s limit)' }, 504);
    }
    log.error('Public scan fetch failed', { url, error: String(err) });
    return c.json({ error: 'Scanner unavailable' }, 502);
  }
});

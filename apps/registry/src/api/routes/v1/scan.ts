/**
 * POST /api/v1/scan — Public security scan endpoint.
 *
 * Accepts multiple URL types (tarball, GitHub folder, raw file, skills.sh),
 * validates them (SSRF protection), rate-limits, proxies to the Python scanner,
 * and returns the scan report synchronously.
 *
 * URL types supported:
 * - npm tarball URLs (registry.npmjs.org)
 * - GitHub release tarballs
 * - GitHub folder URLs (github.com/owner/repo/tree/branch/path)
 * - Raw GitHub files (raw.githubusercontent.com)
 * - skills.sh URLs (skills.sh/owner/repo/skill-name)
 * - agentskills.co.il URLs (agentskills.co.il/{lang}/skills/{category}/{skill-name})
 */

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { env } from '~/consts/env';
import { resolveRequestUserId } from '~/lib/auth/authz';
import { type ExpandedURL, expandScanUrl } from '~/lib/scan/url-expander';
import { validateScanUrl } from '~/lib/scan/url-validator';
import { log as baseLog } from '~/services/logger';
import { anonymousLimiter, authFreeLimiter } from '../../middleware/rate-limit';

const log = baseLog.child({ module: 'scan:public' });

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

  // Step 4: Expand URL (resolve GitHub folders, skills.sh, raw files)
  let expanded: ExpandedURL;
  try {
    expanded = await expandScanUrl(url);
  } catch (err) {
    log.error({ url, error: String(err) }, 'URL expansion failed');
    return c.json({ error: 'Failed to resolve URL' }, 400);
  }

  log.info({ url, urlType: expanded.urlType, tarballUrl: expanded.tarballUrl }, 'URL expanded');

  // Early exit if URL expansion detected a problem (e.g. repo not found)
  if (expanded.error) {
    return c.json({ error: expanded.error }, 400);
  }

  // Step 5: Route to scanner
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (env.SCANNER_SERVICE_KEY) {
      headers['X-Scanner-Key'] = env.SCANNER_SERVICE_KEY;
    }

    // Single-file mode: send raw content directly
    if (expanded.fileContent) {
      const scanResponse = await fetch(`${scanApiUrl}/api/analyze/scan`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tarball_url: '',
          version_id: `public-scan-${crypto.randomUUID()}`,
          manifest: {},
          permissions: {},
          single_file_content: expanded.fileContent,
          single_file_name: extractFileName(url),
          single_file_content_type: expanded.contentType ?? 'text/markdown'
        }),
        signal: AbortSignal.timeout(55_000)
      });

      if (!scanResponse.ok) {
        const errorText = await scanResponse.text().catch(() => 'Unknown error');
        return c.json({ error: 'Scanner error', details: errorText }, 502);
      }

      const scanResult = await scanResponse.json();
      return c.json(scanResult);
    }

    // Standard tarball mode (with optional sub_path)
    const scanResponse = await fetch(`${scanApiUrl}/api/analyze/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tarball_url: expanded.tarballUrl,
        version_id: `public-scan-${crypto.randomUUID()}`,
        manifest: {},
        permissions: {},
        sub_path: expanded.subPath ?? undefined
      }),
      signal: AbortSignal.timeout(55_000)
    });

    if (!scanResponse.ok) {
      const errorText = await scanResponse.text().catch(() => 'Unknown error');
      return c.json({ error: 'Scanner error', details: errorText }, 502);
    }

    const scanResult = await scanResponse.json();
    return c.json(scanResult);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      log.warn({ url }, 'Public scan timed out');
      return c.json({ error: 'Scan timed out (55s limit)' }, 504);
    }
    log.error({ url, error: String(err) }, 'Public scan fetch failed');
    return c.json({ error: 'Scanner unavailable' }, 502);
  }
});

/**
 * Extract filename from URL for single-file scan mode.
 */
function extractFileName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/');
    return segments[segments.length - 1] || 'SKILL.md';
  } catch {
    return 'SKILL.md';
  }
}

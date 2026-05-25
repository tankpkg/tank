import { encodeSkillName } from '@internals/helpers';
import { env } from '~/consts/env';

const CLOUDFLARE_PURGE_TIMEOUT_MS = 5000;

interface CloudflarePurgeResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
}

/**
 * Best-effort edge cache invalidation for a skill's public detail page.
 * Never throws. No-ops when Cloudflare env vars are unset.
 */
export async function purgeSkillCache(name: string): Promise<void> {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) return;

  const base = env.APP_URL.replace(/\/$/, '');
  const url = `${base}/skills/${encodeSkillName(name)}`;

  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: [url] }),
      signal: AbortSignal.timeout(CLOUDFLARE_PURGE_TIMEOUT_MS)
    });

    if (!res.ok) {
      console.error(`[cache-purge] cloudflare HTTP ${res.status} for ${url}`);
      return;
    }

    const body = (await res.json()) as CloudflarePurgeResponse;
    if (!body.success) {
      console.error(`[cache-purge] cloudflare rejected: ${JSON.stringify(body.errors ?? [])}`);
    }
  } catch (err) {
    console.error('[cache-purge] cloudflare request failed:', err);
  }
}

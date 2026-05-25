import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/consts/env', () => ({
  env: {
    APP_URL: 'https://www.tankpkg.dev',
    CLOUDFLARE_API_TOKEN: '',
    CLOUDFLARE_ZONE_ID: ''
  }
}));

import { env } from '~/consts/env';
import { purgeSkillCache } from '../cache-purge';

const mockedEnv = env as { APP_URL: string; CLOUDFLARE_API_TOKEN: string; CLOUDFLARE_ZONE_ID: string };
const ORIGINAL_FETCH = globalThis.fetch;

function setCloudflareEnv(token: string, zone: string): void {
  mockedEnv.CLOUDFLARE_API_TOKEN = token;
  mockedEnv.CLOUDFLARE_ZONE_ID = zone;
}

describe('purgeSkillCache', () => {
  beforeEach(() => {
    mockedEnv.APP_URL = 'https://www.tankpkg.dev';
    setCloudflareEnv('', '');
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('no-ops when CLOUDFLARE_API_TOKEN is unset', async () => {
    setCloudflareEnv('', 'zone-123');
    const fetchFn = vi.fn(async () => new Response('{}'));
    globalThis.fetch = fetchFn as unknown as typeof fetch;

    await purgeSkillCache('@tank/google-search-ads');

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('no-ops when CLOUDFLARE_ZONE_ID is unset', async () => {
    setCloudflareEnv('token-abc', '');
    const fetchFn = vi.fn(async () => new Response('{}'));
    globalThis.fetch = fetchFn as unknown as typeof fetch;

    await purgeSkillCache('@tank/google-search-ads');

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('calls Cloudflare API v4 purge_cache with the canonical skill URL', async () => {
    setCloudflareEnv('token-abc', 'zone-123');
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      return new Response(JSON.stringify({ success: true }));
    }) as unknown as typeof fetch;

    await purgeSkillCache('@tank/google-search-ads');

    expect(capturedUrl).toBe('https://api.cloudflare.com/client/v4/zones/zone-123/purge_cache');
    expect(capturedInit?.method).toBe('POST');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-abc');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(capturedInit?.body as string) as { files: string[] };
    expect(body.files).toEqual(['https://www.tankpkg.dev/skills/@tank/google-search-ads']);
  });

  it('strips trailing slash from APP_URL when building URLs', async () => {
    setCloudflareEnv('token-abc', 'zone-123');
    mockedEnv.APP_URL = 'https://www.tankpkg.dev/';
    let captured: string[] = [];
    globalThis.fetch = vi.fn(async (_url, init?: RequestInit) => {
      captured = (JSON.parse(init?.body as string) as { files: string[] }).files;
      return new Response(JSON.stringify({ success: true }));
    }) as unknown as typeof fetch;

    await purgeSkillCache('foo');

    expect(captured).toEqual(['https://www.tankpkg.dev/skills/foo']);
  });

  it('logs and swallows when Cloudflare returns a non-2xx status', async () => {
    setCloudflareEnv('token-abc', 'zone-123');
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(purgeSkillCache('foo')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[cache-purge] cloudflare HTTP 403'));
  });

  it('logs and swallows when fetch itself rejects', async () => {
    setCloudflareEnv('token-abc', 'zone-123');
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(purgeSkillCache('foo')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[cache-purge] cloudflare request failed'),
      expect.any(Error)
    );
  });

  it('logs and swallows when Cloudflare body has success:false', async () => {
    setCloudflareEnv('token-abc', 'zone-123');
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ success: false, errors: [{ code: 1, message: 'bad' }] }))
    ) as unknown as typeof fetch;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(purgeSkillCache('foo')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[cache-purge] cloudflare rejected'));
  });
});

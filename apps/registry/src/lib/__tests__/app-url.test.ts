import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/consts/env', () => ({
  env: { APP_URL: 'http://localhost:5555' }
}));

import { getAppUrl } from '../app-url';

function fakeContext(headers: Record<string, string>) {
  return {
    req: {
      header(name: string) {
        return headers[name.toLowerCase()];
      }
    }
  } as Parameters<typeof getAppUrl>[0];
}

describe('getAppUrl', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.APP_URL;
    delete process.env.BETTER_AUTH_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns live process.env.APP_URL when set to non-localhost', () => {
    process.env.APP_URL = 'https://tank.acme.corp';
    expect(getAppUrl()).toBe('https://tank.acme.corp');
  });

  it('prefers BETTER_AUTH_URL over APP_URL', () => {
    process.env.BETTER_AUTH_URL = 'https://auth.acme.corp';
    process.env.APP_URL = 'https://tank.acme.corp';
    expect(getAppUrl()).toBe('https://auth.acme.corp');
  });

  it('derives URL from request Host header when process.env is localhost', () => {
    process.env.APP_URL = 'http://localhost:5555';
    const c = fakeContext({
      host: 'tank.acme.corp',
      'x-forwarded-proto': 'https'
    });
    expect(getAppUrl(c)).toBe('https://tank.acme.corp');
  });

  it('derives URL from X-Forwarded-Host when present', () => {
    process.env.APP_URL = 'http://localhost:5555';
    const c = fakeContext({
      'x-forwarded-host': 'tank.acme.corp',
      'x-forwarded-proto': 'https',
      host: 'internal-docker:3000'
    });
    expect(getAppUrl(c)).toBe('https://tank.acme.corp');
  });

  it('returns localhost for dev when no context provided', () => {
    process.env.APP_URL = 'http://localhost:5555';
    expect(getAppUrl()).toBe('http://localhost:5555');
  });

  it('falls back to frozen env.APP_URL when process.env is empty', () => {
    expect(getAppUrl()).toBe('http://localhost:5555');
  });

  it('strips trailing slash from derived host', () => {
    process.env.APP_URL = 'http://localhost:5555';
    const c = fakeContext({
      host: 'tank.acme.corp/',
      'x-forwarded-proto': 'https'
    });
    expect(getAppUrl(c)).toBe('https://tank.acme.corp');
  });

  it('skips request-header fallback when host is also localhost', () => {
    process.env.APP_URL = 'http://localhost:5555';
    const c = fakeContext({
      host: 'localhost:3000',
      'x-forwarded-proto': 'http'
    });
    expect(getAppUrl(c)).toBe('http://localhost:5555');
  });

  it('defaults X-Forwarded-Proto to https when header missing', () => {
    process.env.APP_URL = 'http://localhost:5555';
    const c = fakeContext({ host: 'tank.acme.corp' });
    expect(getAppUrl(c)).toBe('https://tank.acme.corp');
  });
});

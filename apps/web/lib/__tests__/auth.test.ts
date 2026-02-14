import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('postgres', () => {
  const mockSql = Object.assign(vi.fn().mockReturnValue([{ ok: 1 }]), {
    end: vi.fn(),
    options: {
      parsers: {},
      serializers: {},
      transform: { undefined: undefined },
    },
    reserve: vi.fn(),
  });
  return { default: vi.fn(() => mockSql) };
});

describe('auth module', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.BETTER_AUTH_SECRET = 'test-secret-for-unit-tests';
  });

  it('exports auth instance', async () => {
    const { auth } = await import('../auth');
    expect(auth).toBeDefined();
  });

  it('auth has api methods', async () => {
    const { auth } = await import('../auth');
    expect(auth.api).toBeDefined();
    expect(auth.handler).toBeDefined();
  });

  it('auth has verifyApiKey method from apiKey plugin', async () => {
    const { auth } = await import('../auth');
    expect(auth.api.verifyApiKey).toBeTypeOf('function');
  });
});

describe('auth-client module', () => {
  it('exports authClient, signIn, signOut, useSession', async () => {
    const mod = await import('../auth-client');
    expect(mod.authClient).toBeDefined();
    expect(mod.signIn).toBeDefined();
    expect(mod.signOut).toBeDefined();
    expect(mod.useSession).toBeDefined();
  });
});

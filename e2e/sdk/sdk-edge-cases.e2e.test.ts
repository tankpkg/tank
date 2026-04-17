import {
  hasNativeAcceleration,
  TankAuthError,
  TankClient,
  TankError,
  TankNetworkError,
  TankNotFoundError
} from '@tankpkg/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupE2E, type E2EContext, hasRegistry, setupE2E } from '../helpers/setup';

const describeIfRegistry = hasRegistry ? describe : describe.skip;

const SEEDED_SKILL = '@tank/react';

describeIfRegistry('SDK Edge Cases E2E — security, error handling, concurrency', () => {
  let ctx: E2EContext;
  let client: TankClient;

  beforeAll(async () => {
    ctx = await setupE2E();
    client = new TankClient({
      token: ctx.token,
      registryUrl: ctx.registry,
      timeoutMs: 15_000,
      maxRetries: 1
    });
  });

  afterAll(async () => {
    await cleanupE2E(ctx);
  });

  // ---------------------------------------------------------------------------
  // Registry URL validation
  // ---------------------------------------------------------------------------

  it('rejects registry URL containing credentials', () => {
    expect(() => new TankClient({ registryUrl: 'https://user:pass@evil.com' })).toThrow();
  });

  it('rejects registry URL with non-http scheme', () => {
    expect(() => new TankClient({ registryUrl: 'ftp://evil.com' })).toThrow();
  });

  it('normalizes registry URL with trailing slashes', () => {
    const c = new TankClient({ registryUrl: 'http://localhost:5555///' });
    expect(c).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Network errors
  // ---------------------------------------------------------------------------

  it('throws TankNetworkError for unreachable registry', async () => {
    const c = new TankClient({
      registryUrl: 'http://192.0.2.1:1',
      maxRetries: 0,
      timeoutMs: 2_000
    });
    await expect(c.search('test')).rejects.toThrow(TankNetworkError);
  });

  // ---------------------------------------------------------------------------
  // Search edge cases
  // ---------------------------------------------------------------------------

  it('multiple sequential API calls reuse client correctly', async () => {
    const r1 = await client.search('react');
    const r2 = await client.search(`__no_match_${ctx.runId}__`);
    expect(r1.results.length).toBeGreaterThan(0);
    expect(r2.results).toHaveLength(0);
  });

  it('empty search query returns results without crashing', async () => {
    const result = await client.search('');
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('special characters in search do not crash', async () => {
    const result = await client.search('react && || !');
    expect(result).toBeDefined();
    expect(result.results).toBeInstanceOf(Array);
  });

  // ---------------------------------------------------------------------------
  // Scoped name encoding
  // ---------------------------------------------------------------------------

  it('info with URL-encoded scoped name works', async () => {
    const info = await client.info(SEEDED_SKILL);
    expect(info.name).toBe(SEEDED_SKILL);
  });

  // ---------------------------------------------------------------------------
  // Error hierarchy
  // ---------------------------------------------------------------------------

  it('TankNotFoundError has correct prototype chain and status', async () => {
    try {
      await client.info('@__nonexistent__/missing');
      expect.fail('Expected TankNotFoundError');
    } catch (e) {
      expect(e).toBeInstanceOf(TankNotFoundError);
      expect(e).toBeInstanceOf(TankError);
      expect(e).toBeInstanceOf(Error);
      expect((e as TankNotFoundError).status).toBe(404);
    }
  });

  it('TankAuthError on protected endpoint with bad token', async () => {
    const badClient = new TankClient({
      token: 'garbage',
      registryUrl: ctx.registry,
      timeoutMs: 15_000,
      maxRetries: 0
    });
    await expect(badClient.star(SEEDED_SKILL)).rejects.toThrow(TankAuthError);
  });

  // ---------------------------------------------------------------------------
  // Concurrency
  // ---------------------------------------------------------------------------

  it('concurrent requests do not interfere', async () => {
    const [r1, r2, r3] = await Promise.all([
      client.search('react'),
      client.info(SEEDED_SKILL),
      client.versions(SEEDED_SKILL)
    ]);
    expect(r1.results.length).toBeGreaterThan(0);
    expect(r2.name).toBe(SEEDED_SKILL);
    expect(r3.versions.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Native acceleration
  // ---------------------------------------------------------------------------

  it('hasNativeAcceleration returns boolean', () => {
    expect(typeof hasNativeAcceleration()).toBe('boolean');
  });
});

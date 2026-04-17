import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TankClient, TankNotFoundError } from '@tankpkg/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupE2E, type E2EContext, hasRegistry, setupE2E } from '../helpers/setup';

const describeIfRegistry = hasRegistry ? describe : describe.skip;

const SEEDED_SKILL = '@tank/react';

describeIfRegistry('SDK Discovery E2E — search, info, versions against seeded registry', () => {
  let ctx: E2EContext;
  let client: TankClient;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    if (!hasRegistry) return;
    ctx = await setupE2E();
    client = new TankClient({
      token: ctx.token,
      registryUrl: ctx.registry,
      timeoutMs: 15_000,
      maxRetries: 1
    });
  });

  afterAll(async () => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
    await cleanupE2E(ctx);
  });

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  it('search returns matching results for seeded skill', async () => {
    const result = await client.search('react');
    expect(result).toBeDefined();
    expect(result.results).toBeInstanceOf(Array);
    expect(result.total).toBeGreaterThanOrEqual(1);

    const match = result.results.find((r) => r.name === SEEDED_SKILL);
    expect(match).toBeDefined();
  });

  it('search returns empty results for nonexistent query', async () => {
    const query = `__sdk_discovery_no_results_${ctx.runId}__`;
    const result = await client.search(query);
    expect(result.results).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('search supports pagination', async () => {
    const page1 = await client.search('react', { page: 1, limit: 1 });
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(1);
    expect(page1.results.length).toBeLessThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Info
  // ---------------------------------------------------------------------------

  it('info returns full metadata for seeded skill', async () => {
    const info = await client.info(SEEDED_SKILL);
    expect(info.name).toBe(SEEDED_SKILL);
    expect(info.latestVersion).toBeDefined();
  });

  it('info throws TankNotFoundError for nonexistent skill', async () => {
    const missingSkill = `@__nonexistent__/missing-sdk-e2e-${ctx.runId}`;
    await expect(client.info(missingSkill)).rejects.toThrow(TankNotFoundError);
  });

  // ---------------------------------------------------------------------------
  // Versions
  // ---------------------------------------------------------------------------

  it('versions returns version list for seeded skill', async () => {
    const result = await client.versions(SEEDED_SKILL);
    expect(result.name).toBe(SEEDED_SKILL);
    expect(result.versions).toBeInstanceOf(Array);
    expect(result.versions.length).toBeGreaterThanOrEqual(1);

    const v = result.versions[0];
    expect(v.version).toBeDefined();
    expect(v.integrity).toMatch(/^sha512-/);
    expect(v.publishedAt).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Whoami
  // ---------------------------------------------------------------------------

  it('whoami returns user info with valid token', async () => {
    const user = await client.whoami();
    expect(user).not.toBeNull();
    expect(user?.userId).toBe(ctx.user.id);
    expect(user?.email).toBe(ctx.user.email);
  });

  it('whoami returns null with no token', async () => {
    const prevEnv = process.env.TANK_TOKEN;
    process.env.TANK_TOKEN = '';

    const emptyConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-sdk-noauth-'));
    tempDirs.push(emptyConfigDir);

    try {
      const noAuthClient = new TankClient({
        registryUrl: ctx.registry,
        configDir: emptyConfigDir,
        timeoutMs: 15_000,
        maxRetries: 1
      });
      const result = await noAuthClient.whoami();
      expect(result).toBeNull();
    } finally {
      if (prevEnv === undefined) delete process.env.TANK_TOKEN;
      else process.env.TANK_TOKEN = prevEnv;
    }
  });

  it('whoami returns null with invalid token', async () => {
    const badClient = new TankClient({
      token: 'tank_invalid_garbage_token',
      registryUrl: ctx.registry,
      timeoutMs: 15_000,
      maxRetries: 0
    });
    const result = await badClient.whoami();
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Stars
  // ---------------------------------------------------------------------------

  it('getStarCount returns count for seeded skill', async () => {
    const result = await client.getStarCount(SEEDED_SKILL);
    expect(result.count).toBeGreaterThanOrEqual(0);
    expect(typeof result.isStarred).toBe('boolean');
  });

  it.todo('star and unstar toggle star status — requires session auth (not API key)');
});

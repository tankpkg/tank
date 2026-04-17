import { TankAuthError, TankClient, TankNotFoundError } from '@tankpkg/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupE2E, type E2EContext, hasRegistry, setupE2E } from '../helpers/setup';

const describeIfRegistry = hasRegistry ? describe : describe.skip;

const SEEDED_SKILL = '@tank/react';
const REQUIRE_STORAGE = process.env.E2E_REQUIRE_STORAGE === '1';

describeIfRegistry('SDK Download & Audit E2E — download, audit against seeded registry', () => {
  let ctx: E2EContext;
  let client: TankClient;
  let seededVersion: string;
  let hasStorage = false;

  beforeAll(async () => {
    ctx = await setupE2E();
    client = new TankClient({
      token: ctx.token,
      registryUrl: ctx.registry,
      timeoutMs: 15_000,
      maxRetries: 1
    });

    const info = await client.info(SEEDED_SKILL);
    seededVersion = info.latestVersion;
    if (!seededVersion) {
      throw new Error(`Setup: seeded skill ${SEEDED_SKILL} has no versions`);
    }

    try {
      await client.download(SEEDED_SKILL, seededVersion, { buffer: true });
      hasStorage = true;
    } catch (err) {
      if (err instanceof TankAuthError) throw err;
      if (REQUIRE_STORAGE) throw err;
      hasStorage = false;
    }
  });

  afterAll(async () => {
    await cleanupE2E(ctx);
  });

  it('download nonexistent skill throws TankNotFoundError', async () => {
    const missingSkill = `@__nonexistent__/missing-sdk-e2e-${ctx.runId}`;
    await expect(client.download(missingSkill, '1.0.0')).rejects.toThrow(TankNotFoundError);
  });

  it.skipIf(!hasStorage)('download as buffer returns tarball bytes', async () => {
    const buffer = await client.download(SEEDED_SKILL, seededVersion, { buffer: true });
    expect(buffer).toBeInstanceOf(Buffer);
    expect((buffer as Buffer).length).toBeGreaterThan(0);
  });

  it.skipIf(!hasStorage)('audit returns score and findings for seeded skill', async () => {
    const result = await client.audit(SEEDED_SKILL, seededVersion);
    expect(result.name).toBe(SEEDED_SKILL);
    expect(result.version).toBe(seededVersion);
    expect(typeof result.auditScore).toBe('number');
  });

  it.skipIf(!hasStorage)('permissions returns declared permission set or null', async () => {
    const perms = await client.permissions(SEEDED_SKILL, seededVersion);
    if (perms !== null) {
      expect(typeof perms).toBe('object');
    }
  });
});

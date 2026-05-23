/**
 * CLI Telemetry E2E Tests — opt-in/out, config, env override, resilience.
 * ZERO mocks: real CLI binary, real config file, real env vars.
 *
 * Prerequisites:
 * - CLI built: bun run build --filter=@tankpkg/cli
 * - DATABASE_URL set in .env (for setupE2E)
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runTank } from '../helpers/cli';
import { cleanupE2E, type E2EContext, hasRegistry, setupE2E } from '../helpers/setup';

const describeIfRegistry = hasRegistry ? describe : describe.skip;

function readConfig(home: string): Record<string, unknown> {
  const configPath = path.join(home, '.tank', 'config.json');
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

describeIfRegistry('CLI Telemetry — opt-in/out and config management', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    if (!hasRegistry) return;
    ctx = await setupE2E();
  });

  afterAll(async () => {
    await cleanupE2E(ctx);
  });

  // ── Default behavior: telemetry disabled ──────────────────────────

  it('telemetry key is absent by default in config', () => {
    const config = readConfig(ctx.home);
    expect(config.telemetry).toBeUndefined();
  });

  it('telemetry status shows disabled when not configured', async () => {
    const result = await runTank(['telemetry', 'status'], { home: ctx.home });
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/disabled|off/i);
  });

  // ── Opt-in ────────────────────────────────────────────────────────

  it('tank telemetry on sets config to true', async () => {
    const result = await runTank(['telemetry', 'on'], { home: ctx.home });
    expect(result.exitCode).toBe(0);

    const config = readConfig(ctx.home);
    expect(config.telemetry).toBe(true);
  });

  it('telemetry status shows enabled after opt-in (when key is compiled)', async () => {
    const result = await runTank(['telemetry', 'status'], {
      home: ctx.home,
      env: { TANK_POSTHOG_KEY: 'phc_test_dummy' }
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/enabled|on/i);
  });

  // ── Opt-out ───────────────────────────────────────────────────────

  it('tank telemetry off sets config to false', async () => {
    const result = await runTank(['telemetry', 'off'], { home: ctx.home });
    expect(result.exitCode).toBe(0);

    const config = readConfig(ctx.home);
    expect(config.telemetry).toBe(false);
  });

  it('telemetry status shows disabled after opt-out', async () => {
    const result = await runTank(['telemetry', 'status'], { home: ctx.home });
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/disabled|off/i);
  });

  // ── Environment variable override ─────────────────────────────────

  it('TANK_TELEMETRY=0 overrides enabled config', async () => {
    await runTank(['telemetry', 'on'], { home: ctx.home });
    expect(readConfig(ctx.home).telemetry).toBe(true);

    const result = await runTank(['telemetry', 'status'], {
      home: ctx.home,
      env: { TANK_TELEMETRY: '0', TANK_POSTHOG_KEY: 'phc_test_dummy' }
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/disabled|off|overridden/i);
  });

  it('TANK_TELEMETRY=1 overrides disabled config when key is compiled', async () => {
    await runTank(['telemetry', 'off'], { home: ctx.home });
    expect(readConfig(ctx.home).telemetry).toBe(false);

    const result = await runTank(['telemetry', 'status'], {
      home: ctx.home,
      env: { TANK_TELEMETRY: '1', TANK_POSTHOG_KEY: 'phc_test_dummy' }
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/enabled|on|overridden/i);
  });

  it('reports "no key compiled" when build lacks TANK_POSTHOG_KEY', async () => {
    const result = await runTank(['telemetry', 'status'], { home: ctx.home, env: { TANK_POSTHOG_KEY: '' } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/no key compiled|disabled/i);
  });

  // ── Resilience: telemetry failure does not block commands ─────────

  it('tank search works even with broken telemetry backend', async () => {
    // Enable telemetry, point to unreachable host
    await runTank(['telemetry', 'on'], { home: ctx.home });

    const result = await runTank(['search', 'nonexistent-package-xyz'], {
      home: ctx.home,
      env: {
        // Point to unreachable host to simulate failure
        TANK_TELEMETRY_HOST: 'http://999.999.999.999:99999'
      }
    });

    // Command should still succeed (search returns results, just none found)
    expect(result.exitCode).toBe(0);
    // Must not contain telemetry-related crash errors
    expect(result.stderr).not.toMatch(/telemetry/i);
  });

  // ── Install command does not leak package name ────────────────────
  // (tested at module level — the telemetry module must strip args)

  it('telemetry status command exits cleanly', async () => {
    const result = await runTank(['telemetry', 'status'], { home: ctx.home });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
  });

  it('telemetry on command prints confirmation', async () => {
    const result = await runTank(['telemetry', 'on'], { home: ctx.home });
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/telemetry|enabled|on/i);
  });

  it('telemetry off command prints confirmation', async () => {
    const result = await runTank(['telemetry', 'off'], { home: ctx.home });
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/telemetry|disabled|off/i);
  });
});

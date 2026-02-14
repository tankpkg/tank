/**
 * Consumer E2E Tests — install, verify, audit, and manage skills.
 * ZERO mocks: real CLI binary, real HTTP, real database.
 *
 * Depends on producer.e2e.test.ts running first (fileParallelism: false).
 * This suite publishes its own skill, then tests all consumer flows against it.
 *
 * Prerequisites:
 * - Next.js dev server running on localhost:3000
 * - DATABASE_URL set in .env.local
 * - CLI built: pnpm build --filter=tank
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runTank, expectSuccess, expectFailure } from './helpers/cli';
import { setupE2E, cleanupE2E, type E2EContext } from './helpers/setup';
import { createSkillFixture, createConsumerFixture, bumpSkillVersion, cleanupFixture, type SkillFixture, type ConsumerFixture } from './helpers/fixtures';

describe('Consumer E2E — install and manage skills', () => {
  let ctx: E2EContext;
  let skill: SkillFixture;
  let consumer: ConsumerFixture;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ctx = await setupE2E();

    // Publish a skill for consumer tests to install
    skill = createSkillFixture({
      orgSlug: ctx.orgSlug,
      skillName: 'consumer-test-skill',
      version: '1.0.0',
      description: 'E2E consumer test skill',
      permissions: {
        network: { outbound: ['*.example.com'] },
        filesystem: { read: ['./src/**'] },
        subprocess: false,
      },
    });
    tempDirs.push(skill.dir);

    // Publish v1.0.0
    const pub1 = await runTank(['publish'], {
      cwd: skill.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });
    if (pub1.exitCode !== 0) {
      throw new Error(`Setup: publish v1.0.0 failed: ${pub1.stderr}`);
    }

    // Publish v1.1.0 so we can test updates
    bumpSkillVersion(skill, '1.1.0');
    const pub2 = await runTank(['publish'], {
      cwd: skill.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });
    if (pub2.exitCode !== 0) {
      throw new Error(`Setup: publish v1.1.0 failed: ${pub2.stderr}`);
    }
  });

  afterAll(async () => {
    for (const dir of tempDirs) {
      cleanupFixture(dir);
    }
    await cleanupE2E(ctx);
  });

  // Helper: create a fresh consumer project for isolation
  function freshConsumer(opts?: {
    permissions?: Record<string, unknown>;
    skills?: Record<string, string>;
  }): ConsumerFixture {
    const c = createConsumerFixture(opts);
    tempDirs.push(c.dir);
    return c;
  }

  // -----------------------------------------------------------------------
  // 1. install downloads and extracts skill
  // -----------------------------------------------------------------------
  it('install downloads and extracts skill', async () => {
    consumer = freshConsumer();

    const result = await runTank(['install', skill.name, '^1.0.0'], {
      cwd: consumer.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toContain(skill.name);

    // Verify files extracted to .tank/skills/@org/name/
    const [scope, name] = skill.name.slice(1).split('/'); // remove @ prefix
    const skillDir = path.join(consumer.dir, '.tank', 'skills', `@${scope}`, name);
    expect(fs.existsSync(skillDir)).toBe(true);

    // Verify skills.json was updated with the dependency
    const skillsJson = JSON.parse(fs.readFileSync(path.join(consumer.dir, 'skills.json'), 'utf-8'));
    expect(skillsJson.skills[skill.name]).toBeDefined();

    // Verify skills.lock was created
    const lockPath = path.join(consumer.dir, 'skills.lock');
    expect(fs.existsSync(lockPath)).toBe(true);
    const lockfile = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    // Lock key format: name@version
    const lockKeys = Object.keys(lockfile.skills);
    const matchingKey = lockKeys.find(k => k.startsWith(skill.name + '@'));
    expect(matchingKey).toBeDefined();
    // Verify integrity hash exists
    expect(lockfile.skills[matchingKey!].integrity).toMatch(/^sha512-/);
  });

  // -----------------------------------------------------------------------
  // 2. verify passes after clean install
  // -----------------------------------------------------------------------
  it('verify passes after clean install', async () => {
    // consumer was set up in test 1 with install
    const result = await runTank(['verify'], {
      cwd: consumer.dir,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/verified|pass/i);
  });

  // -----------------------------------------------------------------------
  // 3. verify fails when skill directory deleted
  // -----------------------------------------------------------------------
  it('verify fails when skill directory is deleted', async () => {
    // Delete the extracted skill directory
    const [scope, name] = skill.name.slice(1).split('/');
    const skillDir = path.join(consumer.dir, '.tank', 'skills', `@${scope}`, name);
    fs.rmSync(skillDir, { recursive: true, force: true });

    const result = await runTank(['verify'], {
      cwd: consumer.dir,
      home: ctx.home,
    });

    expectFailure(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/missing|fail/i);
  });

  // -----------------------------------------------------------------------
  // 4. install from lockfile restores skill
  // -----------------------------------------------------------------------
  it('install from lockfile restores skill', async () => {
    // The skill dir was deleted in test 3, but lockfile still exists
    const result = await runTank(['install'], {
      cwd: consumer.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/installed|lockfile/i);

    // Verify files restored
    const [scope, name] = skill.name.slice(1).split('/');
    const skillDir = path.join(consumer.dir, '.tank', 'skills', `@${scope}`, name);
    expect(fs.existsSync(skillDir)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 5. permissions shows resolved permissions
  // -----------------------------------------------------------------------
  it('permissions shows resolved permissions', async () => {
    const result = await runTank(['permissions'], {
      cwd: consumer.dir,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    // Should show the skill's declared permissions
    expect(output).toMatch(/network|outbound/i);
    expect(output).toContain('example.com');
  });

  // -----------------------------------------------------------------------
  // 6. audit shows security scores
  // -----------------------------------------------------------------------
  it('audit shows security scores', async () => {
    const result = await runTank(['audit'], {
      cwd: consumer.dir,
      home: ctx.home,
      timeoutMs: 30_000,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toContain(skill.name);
    // Should show audit info (score or pending)
    expect(output).toMatch(/score|pending|pass|audited/i);
  });

  // -----------------------------------------------------------------------
  // 7. update checks for newer versions
  // -----------------------------------------------------------------------
  it('update installs newer version within range', async () => {
    // Consumer installed ^1.0.0, which resolved to 1.1.0 (latest).
    // Since 1.1.0 is already installed, update should report "up to date".
    // First, let's create a fresh consumer with ^1.0.0 and install the OLDEST version,
    // then update to verify it picks up the newer one.
    const updateConsumer = freshConsumer();

    // Install with explicit 1.0.0 range first
    const install = await runTank(['install', skill.name, '1.0.0'], {
      cwd: updateConsumer.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });
    expectSuccess(install);

    // Now edit skills.json to use ^1.0.0 range (allowing updates to 1.1.0)
    const sjPath = path.join(updateConsumer.dir, 'skills.json');
    const sj = JSON.parse(fs.readFileSync(sjPath, 'utf-8'));
    sj.skills[skill.name] = '^1.0.0';
    fs.writeFileSync(sjPath, JSON.stringify(sj, null, 2) + '\n');

    const result = await runTank(['update', skill.name], {
      cwd: updateConsumer.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    // Should show that it updated or installed 1.1.0
    expect(output).toMatch(/1\.1\.0|updated|installed/i);
  });

  // -----------------------------------------------------------------------
  // 8. remove cleans up skill
  // -----------------------------------------------------------------------
  it('remove cleans up skill completely', async () => {
    // Use the main consumer from test 1-6
    const result = await runTank(['remove', skill.name], {
      cwd: consumer.dir,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/removed/i);

    // Verify skill directory deleted
    const [scope, name] = skill.name.slice(1).split('/');
    const skillDir = path.join(consumer.dir, '.tank', 'skills', `@${scope}`, name);
    expect(fs.existsSync(skillDir)).toBe(false);

    // Verify skills.json no longer lists it
    const skillsJson = JSON.parse(fs.readFileSync(path.join(consumer.dir, 'skills.json'), 'utf-8'));
    expect(skillsJson.skills[skill.name]).toBeUndefined();

    // Verify skills.lock no longer has the entry
    const lockPath = path.join(consumer.dir, 'skills.lock');
    const lockfile = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    const lockKeys = Object.keys(lockfile.skills);
    const matchingKey = lockKeys.find(k => k.startsWith(skill.name + '@'));
    expect(matchingKey).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 9. install with permission budget violation fails
  // -----------------------------------------------------------------------
  it('install with permission budget violation fails', async () => {
    // Create a consumer with a restrictive permission budget that doesn't
    // allow the skill's network outbound (*.example.com)
    const restrictedConsumer = freshConsumer({
      permissions: {
        network: { outbound: [] }, // No network allowed!
        filesystem: { read: ['./src/**'], write: [] },
        subprocess: false,
      },
    });

    const result = await runTank(['install', skill.name], {
      cwd: restrictedConsumer.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });

    expectFailure(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/permission.denied|budget|not.in.the.project/i);
  });

  // -----------------------------------------------------------------------
  // 10. install nonexistent skill fails
  // -----------------------------------------------------------------------
  it('install nonexistent skill fails', async () => {
    const emptyConsumer = freshConsumer();

    const result = await runTank(['install', '@nonexistent/does-not-exist-xyz'], {
      cwd: emptyConsumer.dir,
      home: ctx.home,
    });

    expectFailure(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/not.found|404/i);
  });

  // -----------------------------------------------------------------------
  // 11. search works without auth (public)
  // -----------------------------------------------------------------------
  it('search works without auth (public endpoint)', async () => {
    const noAuthHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tank-noauth-search-'));
    const tankDir = path.join(noAuthHome, '.tank');
    fs.mkdirSync(tankDir, { recursive: true });
    fs.writeFileSync(
      path.join(tankDir, 'config.json'),
      JSON.stringify({ registry: ctx.registry }, null, 2) + '\n',
    );
    tempDirs.push(noAuthHome);

    // Search by description — PostgreSQL full-text search handles plain words
    // better than hyphenated scoped names
    const result = await runTank(['search', 'E2E consumer test skill'], {
      home: noAuthHome,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toContain(skill.name);
  });
});

/**
 * Producer E2E Tests — publish skills to the Tank registry.
 * ZERO mocks: real CLI binary, real HTTP, real database.
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
import { setupE2E, cleanupE2E, skillExists, versionExists, countVersions, type E2EContext } from './helpers/setup';
import { createSkillFixture, bumpSkillVersion, cleanupFixture, type SkillFixture } from './helpers/fixtures';

describe('Producer E2E — publish skills to the Tank registry', () => {
  let ctx: E2EContext;
  let skill: SkillFixture;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ctx = await setupE2E();
  });

  afterAll(async () => {
    // Clean up all temp fixture directories
    for (const dir of tempDirs) {
      cleanupFixture(dir);
    }
    await cleanupE2E(ctx);
  });

  // -----------------------------------------------------------------------
  // 1. whoami shows authenticated user
  // -----------------------------------------------------------------------
  it('whoami shows authenticated user', async () => {
    const result = await runTank(['whoami'], { home: ctx.home });
    expectSuccess(result);
    expect(result.stdout).toContain('E2E Test User');
    expect(result.stdout).toContain(ctx.user.email);
  });

  // -----------------------------------------------------------------------
  // 2. publish --dry-run validates without uploading
  // -----------------------------------------------------------------------
  it('publish --dry-run validates without uploading', async () => {
    skill = createSkillFixture({
      orgSlug: ctx.orgSlug,
      skillName: 'hello-world',
      version: '1.0.0',
      description: 'E2E dry run test skill',
    });
    tempDirs.push(skill.dir);

    const result = await runTank(['publish', '--dry-run'], {
      cwd: skill.dir,
      home: ctx.home,
    });

    expectSuccess(result);
    // Dry run should show skill info without uploading
    const output = result.stdout + result.stderr;
    expect(output).toContain(skill.name);
    expect(output).toContain('1.0.0');
    expect(output).toMatch(/dry.run/i);

    // Verify nothing was persisted to the database
    const exists = await skillExists(ctx.sql, skill.name);
    expect(exists).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 3. publish uploads skill to registry
  // -----------------------------------------------------------------------
  it('publish uploads skill to registry', async () => {
    // Reuse the fixture created in dry-run test (same skill name/version)
    const result = await runTank(['publish'], {
      cwd: skill.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toContain(skill.name);
    expect(output).toContain('1.0.0');

    // Verify skill exists in the database
    const exists = await skillExists(ctx.sql, skill.name);
    expect(exists).toBe(true);

    const vExists = await versionExists(ctx.sql, skill.name, '1.0.0');
    expect(vExists).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 4. publish same version fails with 409
  // -----------------------------------------------------------------------
  it('publish same version fails with 409 conflict', async () => {
    const result = await runTank(['publish'], {
      cwd: skill.dir,
      home: ctx.home,
    });

    expectFailure(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/version.already.exists|bump.the.version/i);
  });

  // -----------------------------------------------------------------------
  // 5. publish with version bump succeeds
  // -----------------------------------------------------------------------
  it('publish with version bump succeeds', async () => {
    bumpSkillVersion(skill, '1.1.0');

    const result = await runTank(['publish'], {
      cwd: skill.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toContain('1.1.0');

    // Verify both versions exist
    const count = await countVersions(ctx.sql, skill.name);
    expect(count).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 6. publish without authentication fails
  // -----------------------------------------------------------------------
  it('publish without authentication fails', async () => {
    const unauthSkill = createSkillFixture({
      orgSlug: ctx.orgSlug,
      skillName: 'no-auth-skill',
      version: '1.0.0',
    });
    tempDirs.push(unauthSkill.dir);

    // Create a temp home with NO token
    const noAuthHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tank-noauth-'));
    const tankDir = path.join(noAuthHome, '.tank');
    fs.mkdirSync(tankDir, { recursive: true });
    fs.writeFileSync(
      path.join(tankDir, 'config.json'),
      JSON.stringify({ registry: ctx.registry }, null, 2) + '\n',
    );
    tempDirs.push(noAuthHome);

    const result = await runTank(['publish'], {
      cwd: unauthSkill.dir,
      home: noAuthHome,
    });

    expectFailure(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/not.logged.in|login/i);
  });

  // -----------------------------------------------------------------------
  // 7. publish invalid manifest fails
  // -----------------------------------------------------------------------
  it('publish with invalid manifest fails', async () => {
    const invalidDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tank-invalid-'));
    tempDirs.push(invalidDir);

    // Write a skills.json missing required fields (no name, no version)
    fs.writeFileSync(
      path.join(invalidDir, 'skills.json'),
      JSON.stringify({ description: 'missing required fields' }, null, 2) + '\n',
    );
    fs.writeFileSync(
      path.join(invalidDir, 'SKILL.md'),
      '# Invalid skill\n',
    );

    const result = await runTank(['publish'], {
      cwd: invalidDir,
      home: ctx.home,
    });

    expectFailure(result);
  });

  // -----------------------------------------------------------------------
  // 8. search finds published skill
  // -----------------------------------------------------------------------
  it('search finds the published skill', async () => {
    // Use the description text — PostgreSQL full-text search handles plain words
    // better than hyphenated scoped names like @org/hello-world
    const result = await runTank(['search', 'E2E dry run test skill'], {
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toContain(skill.name);
  });

  // -----------------------------------------------------------------------
  // 9. info shows published skill metadata
  // -----------------------------------------------------------------------
  it('info shows published skill metadata', async () => {
    const result = await runTank(['info', skill.name], {
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toContain(skill.name);
    // Should show latest version (1.1.0 after bump)
    expect(output).toContain('1.1.0');
  });

  // -----------------------------------------------------------------------
  // 10. logout clears credentials
  // -----------------------------------------------------------------------
  it('logout clears credentials', async () => {
    // Create a separate home so we don't break other tests
    const logoutHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tank-logout-'));
    const tankDir = path.join(logoutHome, '.tank');
    fs.mkdirSync(tankDir, { recursive: true });
    fs.writeFileSync(
      path.join(tankDir, 'config.json'),
      JSON.stringify(
        {
          registry: ctx.registry,
          token: ctx.token,
          user: { name: 'E2E Test User', email: ctx.user.email },
        },
        null,
        2,
      ) + '\n',
    );
    tempDirs.push(logoutHome);

    // Verify whoami works before logout
    const beforeResult = await runTank(['whoami'], { home: logoutHome });
    expectSuccess(beforeResult);
    expect(beforeResult.stdout).toContain('E2E Test User');

    // Logout
    const logoutResult = await runTank(['logout'], { home: logoutHome });
    expectSuccess(logoutResult);
    const logoutOutput = logoutResult.stdout + logoutResult.stderr;
    expect(logoutOutput).toMatch(/logged.out/i);

    // Verify config no longer has token
    const configAfter = JSON.parse(
      fs.readFileSync(path.join(tankDir, 'config.json'), 'utf-8'),
    );
    expect(configAfter.token).toBeUndefined();

    // Whoami should now warn about not being logged in
    const afterResult = await runTank(['whoami'], { home: logoutHome });
    const afterOutput = afterResult.stdout + afterResult.stderr;
    expect(afterOutput).toMatch(/not.logged.in/i);
  });
});

/**
 * Integration E2E Tests — agent linking workflows (local/global/dev).
 * ZERO mocks: real CLI binary, real HTTP, real database.
 *
 * Covers:
 * - Local install + link + doctor + remove
 * - Global install + link + doctor + remove
 * - Dev link + doctor + unlink
 *
 * Prerequisites:
 * - Next.js dev server running on localhost:3000
 * - DATABASE_URL set in .env.local
 * - CLI built: pnpm build --filter=tank
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runTank, expectSuccess } from './helpers/cli';
import { setupE2E, cleanupE2E, type E2EContext } from './helpers/setup';
import {
  createSkillFixture,
  createConsumerFixture,
  cleanupFixture,
  type SkillFixture,
  type ConsumerFixture,
} from './helpers/fixtures';

interface LinksManifest {
  version: 1;
  links: Record<string, {
    source: 'local' | 'global' | 'dev';
    sourceDir: string;
    installedAt: string;
    agentLinks: Record<string, string>;
  }>;
}

describe('Integration E2E — agent linking workflows', () => {
  let ctx: E2EContext;
  let skill: SkillFixture;
  let consumer: ConsumerFixture;
  let devSkill: SkillFixture;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ctx = await setupE2E();

    // Create fake agent config dirs (agent detection checks parent config dir)
    fs.mkdirSync(path.join(ctx.home, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(ctx.home, '.config', 'opencode'), { recursive: true });

    // Publish a skill fixture for install tests
    skill = createSkillFixture({
      orgSlug: ctx.orgSlug,
      skillName: 'integration-test-skill',
      version: '1.0.0',
      description: 'E2E integration test skill',
      permissions: {
        network: { outbound: ['*'] },
        filesystem: { read: ['**/*'], write: ['**/*'] },
        subprocess: true,
      },
    });
    tempDirs.push(skill.dir);

    const pub = await runTank(['publish'], {
      cwd: skill.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });
    if (pub.exitCode !== 0) {
      throw new Error(`Setup: publish failed: ${pub.stderr}`);
    }
  });

  afterAll(async () => {
    for (const dir of tempDirs) {
      cleanupFixture(dir);
    }
    await cleanupE2E(ctx);
  });

  // Helper: create a fresh consumer project with permissive permissions
  function freshConsumer(): ConsumerFixture {
    const c = createConsumerFixture({
      permissions: {
        network: { outbound: ['*'] },
        filesystem: { read: ['**/*'], write: ['**/*'] },
        subprocess: true,
      },
    });
    tempDirs.push(c.dir);
    return c;
  }

  function getSymlinkName(skillName: string): string {
    if (skillName.startsWith('@')) {
      const withoutAt = skillName.slice(1);
      return withoutAt.replace('/', '--');
    }
    return skillName;
  }

  function readJson<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  }

  function getExtractDir(baseDir: string, skillName: string): string {
    if (skillName.startsWith('@')) {
      const [scope, name] = skillName.split('/');
      return path.join(baseDir, scope, name);
    }
    return path.join(baseDir, skillName);
  }

  function getAgentSymlinkPaths(home: string, symlinkName: string): Record<string, string> {
    return {
      claude: path.join(home, '.claude', 'skills', symlinkName),
      opencode: path.join(home, '.config', 'opencode', 'skills', symlinkName),
    };
  }

  function expectFrontmatter(filePath: string): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(/^---\s*\r?\n/.test(content)).toBe(true);
  }

  function expectSymlinkTo(symlinkPath: string, expectedTarget: string): void {
    const stats = fs.lstatSync(symlinkPath);
    expect(stats.isSymbolicLink()).toBe(true);
    const rawTarget = fs.readlinkSync(symlinkPath);
    const resolved = path.isAbsolute(rawTarget)
      ? rawTarget
      : path.resolve(path.dirname(symlinkPath), rawTarget);
    expect(fs.realpathSync(resolved)).toBe(fs.realpathSync(expectedTarget));
  }

  function expectLinksEntry(
    linksPath: string,
    skillName: string,
    source: 'local' | 'global' | 'dev',
    sourceDir: string,
    agentSymlinks: Record<string, string>,
  ): void {
    expect(fs.existsSync(linksPath)).toBe(true);
    const manifest = readJson<LinksManifest>(linksPath);
    expect(manifest.version).toBe(1);
    const entry = manifest.links[skillName];
    expect(entry).toBeDefined();
    expect(entry.source).toBe(source);
    expect(fs.realpathSync(entry.sourceDir)).toBe(fs.realpathSync(sourceDir));
    expect(Object.keys(entry.agentLinks).sort()).toEqual(Object.keys(agentSymlinks).sort());
    for (const [agentId, symlinkPath] of Object.entries(agentSymlinks)) {
      expect(entry.agentLinks[agentId]).toBe(symlinkPath);
    }
  }

  function expectNoLinksEntry(linksPath: string, skillName: string): void {
    if (!fs.existsSync(linksPath)) {
      return;
    }
    const manifest = readJson<LinksManifest>(linksPath);
    expect(manifest.links[skillName]).toBeUndefined();
  }

  // -----------------------------------------------------------------------
  // 1. Local install creates agent symlinks
  // -----------------------------------------------------------------------
  it('local install creates agent symlinks', async () => {
    consumer = freshConsumer();

    const result = await runTank(['install', skill.name, '^1.0.0'], {
      cwd: consumer.dir,
      home: ctx.home,
      timeoutMs: 60_000,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Installed');
    expect(output).toContain(skill.name);
    expect(output).toMatch(/Linked/i);

    const symlinkName = getSymlinkName(skill.name);
    const extractDir = getExtractDir(path.join(consumer.dir, '.tank', 'skills'), skill.name);
    const agentSkillsDir = path.resolve(path.join(consumer.dir, '.tank', 'agent-skills', symlinkName));
    const agentSkillMd = path.join(agentSkillsDir, 'SKILL.md');
    const linksPath = path.join(consumer.dir, '.tank', 'links.json');

    // Verify extraction
    expect(fs.existsSync(extractDir)).toBe(true);

    // Verify agent-skills wrapper and frontmatter
    expect(fs.existsSync(agentSkillMd)).toBe(true);
    expectFrontmatter(agentSkillMd);

    // Verify links.json
    const agentSymlinks = getAgentSymlinkPaths(ctx.home, symlinkName);
    expectLinksEntry(linksPath, skill.name, 'local', agentSkillsDir, agentSymlinks);

    // Verify agent symlinks
    for (const symlinkPath of Object.values(agentSymlinks)) {
      expectSymlinkTo(symlinkPath, agentSkillsDir);
    }
  });

  // -----------------------------------------------------------------------
  // 2. Doctor reports local skill as linked
  // -----------------------------------------------------------------------
  it('doctor reports local skill as linked', async () => {
    const result = await runTank(['doctor'], {
      cwd: consumer.dir,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Tank Doctor Report');
    expect(output).toContain('Claude Code');
    expect(output).toContain('OpenCode');
    expect(output).toContain(skill.name);
    expect(output).toMatch(/linked/i);
  });

  // -----------------------------------------------------------------------
  // 3. Local remove cleans up agent symlinks
  // -----------------------------------------------------------------------
  it('local remove cleans up agent symlinks', async () => {
    const result = await runTank(['remove', skill.name], {
      cwd: consumer.dir,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Removed/i);

    const symlinkName = getSymlinkName(skill.name);
    const extractDir = getExtractDir(path.join(consumer.dir, '.tank', 'skills'), skill.name);
    const agentSkillsDir = path.join(consumer.dir, '.tank', 'agent-skills', symlinkName);
    const linksPath = path.join(consumer.dir, '.tank', 'links.json');
    const agentSymlinks = getAgentSymlinkPaths(ctx.home, symlinkName);

    // Verify removal of extracted skill
    expect(fs.existsSync(extractDir)).toBe(false);

    // Verify agent-skills wrapper removed
    expect(fs.existsSync(agentSkillsDir)).toBe(false);

    // Verify symlinks removed
    for (const symlinkPath of Object.values(agentSymlinks)) {
      expect(fs.existsSync(symlinkPath)).toBe(false);
    }

    // Verify links entry removed
    expectNoLinksEntry(linksPath, skill.name);
  });

  // -----------------------------------------------------------------------
  // 4. Doctor reports empty state after remove
  // -----------------------------------------------------------------------
  it('doctor reports empty state after local remove', async () => {
    const result = await runTank(['doctor'], {
      cwd: consumer.dir,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Local Skills \(0\)/i);
    expect(output).toMatch(/none/i);
  });

  // -----------------------------------------------------------------------
  // 5. Global install creates agent symlinks
  // -----------------------------------------------------------------------
  it('global install creates agent symlinks', async () => {
    const result = await runTank(['install', '-g', skill.name], {
      cwd: ctx.home,
      home: ctx.home,
      timeoutMs: 60_000,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Installed');
    expect(output).toContain(skill.name);

    const symlinkName = getSymlinkName(skill.name);
    const extractDir = getExtractDir(path.join(ctx.home, '.tank', 'skills'), skill.name);
    const agentSkillsDir = path.resolve(path.join(ctx.home, '.tank', 'agent-skills', symlinkName));
    const agentSkillMd = path.join(agentSkillsDir, 'SKILL.md');
    const linksPath = path.join(ctx.home, '.tank', 'links.json');
    const lockPath = path.join(ctx.home, '.tank', 'skills.lock');

    // Verify extraction
    expect(fs.existsSync(extractDir)).toBe(true);

    // Verify agent-skills wrapper and frontmatter
    expect(fs.existsSync(agentSkillMd)).toBe(true);
    expectFrontmatter(agentSkillMd);

    // Verify links.json
    const agentSymlinks = getAgentSymlinkPaths(ctx.home, symlinkName);
    expectLinksEntry(linksPath, skill.name, 'global', agentSkillsDir, agentSymlinks);

    // Verify skills.lock entry
    expect(fs.existsSync(lockPath)).toBe(true);
    const lockfile = readJson<{ skills: Record<string, unknown> }>(lockPath);
    const lockKeys = Object.keys(lockfile.skills);
    const matchingKey = lockKeys.find((key) => key.startsWith(`${skill.name}@`));
    expect(matchingKey).toBeDefined();

    // Verify agent symlinks
    for (const symlinkPath of Object.values(agentSymlinks)) {
      expectSymlinkTo(symlinkPath, agentSkillsDir);
    }
  });

  // -----------------------------------------------------------------------
  // 6. Doctor reports global skill
  // -----------------------------------------------------------------------
  it('doctor reports global skill', async () => {
    const result = await runTank(['doctor'], {
      cwd: ctx.home,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Global Skills \(1\)/i);
    expect(output).toContain(skill.name);
    expect(output).toMatch(/linked/i);
  });

  // -----------------------------------------------------------------------
  // 7. Global remove cleans up
  // -----------------------------------------------------------------------
  it('global remove cleans up', async () => {
    const result = await runTank(['remove', '-g', skill.name], {
      cwd: ctx.home,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Removed/i);
    expect(output).toMatch(/global/i);

    const symlinkName = getSymlinkName(skill.name);
    const extractDir = getExtractDir(path.join(ctx.home, '.tank', 'skills'), skill.name);
    const agentSkillsDir = path.join(ctx.home, '.tank', 'agent-skills', symlinkName);
    const linksPath = path.join(ctx.home, '.tank', 'links.json');
    const lockPath = path.join(ctx.home, '.tank', 'skills.lock');
    const agentSymlinks = getAgentSymlinkPaths(ctx.home, symlinkName);

    // Verify extraction removed
    expect(fs.existsSync(extractDir)).toBe(false);

    // Verify agent-skills wrapper removed
    expect(fs.existsSync(agentSkillsDir)).toBe(false);

    // Verify symlinks removed
    for (const symlinkPath of Object.values(agentSymlinks)) {
      expect(fs.existsSync(symlinkPath)).toBe(false);
    }

    // Verify links entry removed
    expectNoLinksEntry(linksPath, skill.name);

    // Verify lockfile entry removed
    if (fs.existsSync(lockPath)) {
      const lockfile = readJson<{ skills: Record<string, unknown> }>(lockPath);
      const lockKeys = Object.keys(lockfile.skills);
      const matchingKey = lockKeys.find((key) => key.startsWith(`${skill.name}@`));
      expect(matchingKey).toBeUndefined();
    }
  });

  // -----------------------------------------------------------------------
  // 8. Dev link creates agent symlinks
  // -----------------------------------------------------------------------
  it('dev link creates agent symlinks', async () => {
    devSkill = createSkillFixture({
      orgSlug: ctx.orgSlug,
      skillName: 'integration-dev-skill',
      version: '0.1.0',
      description: 'E2E integration dev link skill',
      permissions: {
        network: { outbound: ['*'] },
        filesystem: { read: ['**/*'], write: ['**/*'] },
        subprocess: true,
      },
    });
    tempDirs.push(devSkill.dir);

    const result = await runTank(['link'], {
      cwd: devSkill.dir,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Linked/i);
    expect(output).toContain(devSkill.name);

    const symlinkName = getSymlinkName(devSkill.name);
    const agentSkillsDir = path.resolve(path.join(ctx.home, '.tank', 'agent-skills', symlinkName));
    const linksPath = path.join(ctx.home, '.tank', 'links.json');
    const agentSymlinks = getAgentSymlinkPaths(ctx.home, symlinkName);

    // Verify links.json
    expectLinksEntry(linksPath, devSkill.name, 'dev', agentSkillsDir, agentSymlinks);

    // Verify agent symlinks point to wrapper
    for (const symlinkPath of Object.values(agentSymlinks)) {
      expectSymlinkTo(symlinkPath, agentSkillsDir);
    }
  });

  // -----------------------------------------------------------------------
  // 9. Doctor reports dev link
  // -----------------------------------------------------------------------
  it('doctor reports dev link', async () => {
    const result = await runTank(['doctor'], {
      cwd: devSkill.dir,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Dev Links \(1\)/i);
    expect(output).toContain(devSkill.name);
  });

  // -----------------------------------------------------------------------
  // 10. Dev unlink cleans up
  // -----------------------------------------------------------------------
  it('dev unlink cleans up', async () => {
    const result = await runTank(['unlink'], {
      cwd: devSkill.dir,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Unlinked/i);

    const symlinkName = getSymlinkName(devSkill.name);
    const agentSkillsDir = path.join(ctx.home, '.tank', 'agent-skills', symlinkName);
    const linksPath = path.join(ctx.home, '.tank', 'links.json');
    const agentSymlinks = getAgentSymlinkPaths(ctx.home, symlinkName);

    // Verify symlinks removed
    for (const symlinkPath of Object.values(agentSymlinks)) {
      expect(fs.existsSync(symlinkPath)).toBe(false);
    }

    // Verify wrapper removed
    expect(fs.existsSync(agentSkillsDir)).toBe(false);

    // Verify links entry removed
    expectNoLinksEntry(linksPath, devSkill.name);

    // Verify dev skill directory still exists
    expect(fs.existsSync(devSkill.dir)).toBe(true);
    expect(fs.existsSync(path.join(devSkill.dir, 'SKILL.md'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 11. Doctor reports empty after unlink
  // -----------------------------------------------------------------------
  it('doctor reports empty dev links after unlink', async () => {
    const result = await runTank(['doctor'], {
      cwd: ctx.home,
      home: ctx.home,
    });

    expectSuccess(result);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Dev Links \(0\)/i);
    expect(output).toMatch(/none/i);
  });
});

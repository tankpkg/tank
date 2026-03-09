import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, type TaskContext } from 'vitest';
import { McpTestClient } from '../interactions/mcp-client.js';
import { registerMcpHooks, type McpBddWorld } from '../support/hooks.js';
import { setupE2E } from '../support/setup.js';
import { createSkillFixture, type SkillFixture } from '../support/fixtures.js';

const world: McpBddWorld = {
  client: new McpTestClient(),
  home: '',
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
};

registerMcpHooks(world);

let skillFixture: SkillFixture | undefined;

function projectDir(): string {
  return path.join(world.home, 'project');
}

function ensureProjectDir(): void {
  fs.mkdirSync(projectDir(), { recursive: true });
}

function writeSkillsJson(skills: Record<string, string> = {}): void {
  ensureProjectDir();
  const manifest = {
    name: 'test-project',
    version: '1.0.0',
    skills,
    permissions: { network: { outbound: [] }, filesystem: { read: [], write: [] }, subprocess: false },
  };
  fs.writeFileSync(path.join(projectDir(), 'tank.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function writeLockfile(skills: Record<string, { resolved: string; integrity: string; permissions: Record<string, unknown>; audit_score: number | null }>): void {
  ensureProjectDir();
  const lock = { lockfileVersion: 1, skills };
  fs.writeFileSync(path.join(projectDir(), 'tank.lock'), JSON.stringify(lock, null, 2) + '\n');
}

async function givenMcpServerIsRunning(): Promise<void> {
  const tools = await world.client.listTools();
  expect(Array.isArray(tools)).toBe(true);
}

async function givenEmmaIsAuthenticatedWithTank(): Promise<void> {
  const ctx = await setupE2E(world.registry);
  world.e2eContext = ctx;
  world.home = ctx.home;

  await world.client.stop();
  await world.client.start({
    home: ctx.home,
    env: {
      TANK_TOKEN: ctx.token,
    },
  });
}

async function givenNoUserIsAuthenticatedWithTank(): Promise<void> {
  const configPath = path.join(world.home, '.tank', 'config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw) as {
    registry: string;
    token?: string;
    user?: { name: string; email: string };
  };

  delete config.token;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  await world.client.stop();
  await world.client.start({ home: world.home });
}

async function publishTestSkill(): Promise<{ name: string; version: string } | null> {
  if (!world.e2eContext) {
    throw new Error('E2E context not set up — call givenEmmaIsAuthenticatedWithTank first');
  }

  const orgSlug = world.e2eContext.orgSlug;
  const runId = world.e2eContext.runId;
  const name = `@${orgSlug}/bdd-install-${runId}`;
  const version = '1.0.0';

  skillFixture = createSkillFixture({
    name,
    version,
    description: 'BDD fixture skill for install tests',
  });

  const result = await world.client.callTool('publish-skill', {
    directory: skillFixture.dir,
    visibility: 'public',
    dryRun: false,
  });

  if (result.isError || !result.content.includes('Published')) {
    return null;
  }

  return { name, version };
}

function requirePublishedSkill(
  ctx: TaskContext,
  published: { name: string; version: string } | null,
): asserts published is { name: string; version: string } {
  if (!published) {
    ctx.skip();
    throw new Error('unreachable');
  }
}

async function whenAgentCallsTool(toolName: string, args: Record<string, unknown> = {}): Promise<void> {
  world.lastToolResult = await world.client.callTool(toolName, args);
}

function thenResponseContains(pattern: RegExp): void {
  const content = world.lastToolResult?.content ?? '';
  expect(content).toMatch(pattern);
}

function thenToolCompletesWithoutError(): void {
  expect(world.lastToolResult?.isError).not.toBe(true);
}

function thenToolReturnsError(): void {
  expect(world.lastToolResult?.isError).toBe(true);
}

describe('Feature: Skill installation via MCP tool', () => {
  // ─── Error cases (no published skill needed) ──────────────────────────

  describe('Scenario: Agent installs a skill with a name that is not scoped', () => {
    it('Given/When/Then for unscoped name validation', async () => {
      await givenMcpServerIsRunning();

      await whenAgentCallsTool('install-skill', { name: 'web-search' });

      thenToolReturnsError();
      thenResponseContains(/validation error/i);
      thenResponseContains(/@org\/name/i);
    });
  });

  describe('Scenario: Agent attempts to install without being authenticated', () => {
    it('Given/When/Then for unauthenticated install', async () => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();
      await givenNoUserIsAuthenticatedWithTank();

      await whenAgentCallsTool('install-skill', { name: '@acme/web-search' });

      thenToolReturnsError();
      thenResponseContains(/not authenticated|log in|login/i);
    });
  });

  describe('Scenario: Agent installs a skill that does not exist in the registry', () => {
    it('Given/When/Then for nonexistent skill', async () => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();

      await whenAgentCallsTool('install-skill', {
        name: '@acme/nonexistent-skill-bdd-test',
        directory: projectDir(),
      });

      thenToolReturnsError();
      thenResponseContains(/not found/i);
      thenResponseContains(/@acme\/nonexistent-skill-bdd-test/i);
    });
  });

  describe('Scenario: Agent installs a skill when the registry is unreachable', () => {
    it('Given/When/Then for unreachable registry', async () => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();

      const configPath = path.join(world.home, '.tank', 'config.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw) as {
        registry: string;
        token?: string;
      };
      config.registry = 'http://127.0.0.1:1';
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

      await world.client.stop();
      await world.client.start({
        home: world.home,
        env: { TANK_TOKEN: world.e2eContext!.token },
      });

      await whenAgentCallsTool('install-skill', {
        name: '@acme/web-search',
        directory: projectDir(),
      });

      thenToolReturnsError();
      thenResponseContains(/cannot reach|network|connect|unreachable|failed/i);

      const skillDir = path.join(projectDir(), '.tank', 'skills', '@acme', 'web-search');
      expect(fs.existsSync(skillDir)).toBe(false);
    });
  });

  // ─── Happy paths (need a published skill) ─────────────────────────────

  describe('Scenario: Agent installs a skill by name and latest version is resolved', () => {
    it('Given/When/Then for install latest version', async (ctx) => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();

      const published = await publishTestSkill();
      requirePublishedSkill(ctx, published);
      const { name, version } = published;
      writeSkillsJson();

      await whenAgentCallsTool('install-skill', {
        name,
        directory: projectDir(),
      });

      thenToolCompletesWithoutError();
      thenResponseContains(/installed/i);
      thenResponseContains(new RegExp(version.replace(/\./g, '\\.')));
      thenResponseContains(/SHA-512.*verified/i);

      const lockRaw = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const lock = JSON.parse(lockRaw) as { skills: Record<string, { integrity: string }> };
      const lockKey = `${name}@${version}`;
      expect(lock.skills[lockKey]).toBeDefined();
      expect(lock.skills[lockKey].integrity).toMatch(/^sha512-/);

      const sjRaw = fs.readFileSync(path.join(projectDir(), 'tank.json'), 'utf-8');
      const sj = JSON.parse(sjRaw) as { skills: Record<string, string> };
      expect(sj.skills[name]).toBeDefined();
    });
  });

  describe('Scenario: Agent installs a skill at a specific version', () => {
    it('Given/When/Then for install specific version', async (ctx) => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();

      const published = await publishTestSkill();
      requirePublishedSkill(ctx, published);
      const { name, version } = published;
      writeSkillsJson();

      await whenAgentCallsTool('install-skill', {
        name,
        version,
        directory: projectDir(),
      });

      thenToolCompletesWithoutError();
      thenResponseContains(new RegExp(`${version.replace(/\./g, '\\.')}`));

      const lockRaw = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const lock = JSON.parse(lockRaw) as { skills: Record<string, { integrity: string }> };
      const lockKey = `${name}@${version}`;
      expect(lock.skills[lockKey]).toBeDefined();
      expect(lock.skills[lockKey].integrity).toMatch(/^sha512-/);
    });
  });

  describe('Scenario: Agent installs a skill that is already installed at the same version', () => {
    it('Given/When/Then for already installed skill', async (ctx) => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();

      const published = await publishTestSkill();
      requirePublishedSkill(ctx, published);
      const { name, version } = published;
      writeSkillsJson();

      await whenAgentCallsTool('install-skill', {
        name,
        version,
        directory: projectDir(),
      });
      thenToolCompletesWithoutError();

      const lockBefore = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const sjBefore = fs.readFileSync(path.join(projectDir(), 'tank.json'), 'utf-8');

      await whenAgentCallsTool('install-skill', {
        name,
        version,
        directory: projectDir(),
      });

      thenToolCompletesWithoutError();
      thenResponseContains(/already installed/i);

      const lockAfter = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const sjAfter = fs.readFileSync(path.join(projectDir(), 'tank.json'), 'utf-8');
      expect(lockAfter).toBe(lockBefore);
      expect(sjAfter).toBe(sjBefore);
    });
  });

  describe('Scenario: Agent installs a skill at a version that does not exist', () => {
    it('Given/When/Then for nonexistent version', async (ctx) => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();

      const published = await publishTestSkill();
      requirePublishedSkill(ctx, published);
      const { name } = published;
      writeSkillsJson();

      await whenAgentCallsTool('install-skill', {
        name,
        version: '99.0.0',
        directory: projectDir(),
      });

      thenToolReturnsError();
      thenResponseContains(/no version.*satisfies|version.*not found/i);
    });
  });

  describe('Scenario: Agent installs a skill with a semver range', () => {
    it('Given/When/Then for semver range resolution', async (ctx) => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();

      const published = await publishTestSkill();
      requirePublishedSkill(ctx, published);
      const { name, version } = published;
      writeSkillsJson();

      await whenAgentCallsTool('install-skill', {
        name,
        version: `^${version}`,
        directory: projectDir(),
      });

      thenToolCompletesWithoutError();
      thenResponseContains(new RegExp(version.replace(/\./g, '\\.')));

      const lockRaw = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const lock = JSON.parse(lockRaw) as { skills: Record<string, unknown> };
      const lockKey = `${name}@${version}`;
      expect(lock.skills[lockKey]).toBeDefined();
    });
  });

});

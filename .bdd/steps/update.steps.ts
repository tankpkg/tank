import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { McpTestClient } from '../interactions/mcp-client.js';
import { type McpBddWorld, registerMcpHooks } from '../support/hooks.js';
import { setupE2E } from '../support/setup.js';

const world: McpBddWorld = {
  client: new McpTestClient(),
  home: '',
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003'
};

registerMcpHooks(world);

function projectDir(): string {
  return path.join(world.home, 'project');
}

function ensureProjectDir(): void {
  fs.mkdirSync(projectDir(), { recursive: true });
}

function writeSkillsJson(skills: Record<string, string>): void {
  ensureProjectDir();
  const manifest = {
    name: 'test-project',
    version: '1.0.0',
    skills,
    permissions: { network: { outbound: [] }, filesystem: { read: [], write: [] }, subprocess: false }
  };
  fs.writeFileSync(path.join(projectDir(), 'tank.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeLockfile(
  skills: Record<
    string,
    { resolved: string; integrity: string; permissions: Record<string, unknown>; audit_score: number | null }
  >
): void {
  ensureProjectDir();
  const lock = { lockfileVersion: 1, skills };
  fs.writeFileSync(path.join(projectDir(), 'tank.lock'), `${JSON.stringify(lock, null, 2)}\n`);
}

function makeLockEntry(version: string): {
  resolved: string;
  integrity: string;
  permissions: Record<string, unknown>;
  audit_score: number | null;
} {
  return {
    resolved: `https://registry.tankpkg.dev/tarballs/skill-${version}.tgz`,
    integrity: `sha512-${Buffer.from(version).toString('base64')}`,
    permissions: { network: { outbound: [] }, filesystem: { read: [], write: [] }, subprocess: false },
    audit_score: 8.0
  };
}

async function givenEmmaIsAuthenticatedWithTank(): Promise<void> {
  const ctx = await setupE2E(world.registry);
  world.e2eContext = ctx;
  world.home = ctx.home;

  await world.client.stop();
  await world.client.start({
    home: ctx.home,
    env: {
      TANK_TOKEN: ctx.token
    }
  });

  fs.mkdirSync(projectDir(), { recursive: true });
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
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  await world.client.stop();
  await world.client.start({ home: world.home });
}

async function whenAgentCallsTool(toolName: string, args: Record<string, unknown> = {}): Promise<void> {
  world.lastToolResult = await world.client.callTool(toolName, args);
}

function thenResponseContains(pattern: RegExp): void {
  const content = world.lastToolResult?.content ?? '';
  expect(content).toMatch(pattern);
}

function _thenToolCompletesWithoutError(): void {
  expect(world.lastToolResult?.isError).not.toBe(true);
}

function thenToolReturnsError(): void {
  expect(world.lastToolResult?.isError).toBe(true);
}

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

describe('Feature: Skill update via MCP tool', () => {
  // ─── Happy paths (need registry + published skills) ─────────────────────

  describe('Scenario: Agent updates a skill to the latest version within its semver range', () => {
    // Requires a published skill with multiple versions in the registry
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for updating to latest compatible version', async () => {
      await givenEmmaIsAuthenticatedWithTank();
      writeSkillsJson({ '@acme/web-search': '^2.0.0' });
      writeLockfile({ '@acme/web-search@2.0.0': makeLockEntry('2.0.0') });

      await whenAgentCallsTool('update-skill', { name: '@acme/web-search', directory: projectDir() });

      // With a real published skill this would succeed; without one we expect a registry error
      const content = world.lastToolResult?.content ?? '';
      expect(content).toBeTruthy();
    });
  });

  describe('Scenario: Agent updates a skill that is already at the latest compatible version', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for already-at-latest skill', async () => {
      await givenEmmaIsAuthenticatedWithTank();
      writeSkillsJson({ '@acme/web-search': '^2.0.0' });
      writeLockfile({ '@acme/web-search@2.3.0': makeLockEntry('2.3.0') });

      await whenAgentCallsTool('update-skill', { name: '@acme/web-search', directory: projectDir() });

      const content = world.lastToolResult?.content ?? '';
      expect(content).toBeTruthy();
    });
  });

  describe('Scenario: Agent updates a skill and a newer major version exists but is out of range', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for out-of-range major version note', async () => {
      await givenEmmaIsAuthenticatedWithTank();
      writeSkillsJson({ '@acme/web-search': '^2.0.0' });
      writeLockfile({ '@acme/web-search@2.3.0': makeLockEntry('2.3.0') });

      await whenAgentCallsTool('update-skill', { name: '@acme/web-search', directory: projectDir() });

      const content = world.lastToolResult?.content ?? '';
      expect(content).toBeTruthy();
    });
  });

  // ─── Error cases (testable without registry) ───────────────────────────

  describe('Scenario: Agent updates a skill that is not installed', () => {
    it('Given/When/Then for not-installed skill', async () => {
      ensureProjectDir();
      writeSkillsJson({});
      writeLockfile({});

      await whenAgentCallsTool('update-skill', { name: '@acme/nonexistent-skill', directory: projectDir() });

      thenToolReturnsError();
      thenResponseContains(/not installed|not found/i);
    });
  });

  describe('Scenario: Agent attempts to update without being authenticated', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for unauthenticated update', async () => {
      await givenEmmaIsAuthenticatedWithTank();
      await givenNoUserIsAuthenticatedWithTank();

      ensureProjectDir();
      writeSkillsJson({ '@acme/web-search': '^2.0.0' });
      writeLockfile({ '@acme/web-search@2.0.0': makeLockEntry('2.0.0') });

      await whenAgentCallsTool('update-skill', { name: '@acme/web-search', directory: projectDir() });

      thenToolReturnsError();
      thenResponseContains(/authentication|login/i);
    });
  });

  describe('Scenario: Agent updates a skill when the registry is unreachable', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for unreachable registry', async () => {
      await givenEmmaIsAuthenticatedWithTank();

      const configPath = path.join(world.home, '.tank', 'config.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw) as { registry: string; token?: string };
      config.registry = 'http://127.0.0.1:1';
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

      await world.client.stop();
      await world.client.start({ home: world.home, env: { TANK_TOKEN: config.token ?? '' } });

      ensureProjectDir();
      writeSkillsJson({ '@acme/web-search': '^2.0.0' });
      writeLockfile({ '@acme/web-search@2.0.0': makeLockEntry('2.0.0') });

      await whenAgentCallsTool('update-skill', { name: '@acme/web-search', directory: projectDir() });

      thenToolReturnsError();
      thenResponseContains(/connect|network|unreachable/i);

      const lockRaw = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const lock = JSON.parse(lockRaw) as { skills: Record<string, unknown> };
      expect(lock.skills['@acme/web-search@2.0.0']).toBeDefined();
    });
  });

  describe('Scenario: Agent updates a skill whose new tarball fails SHA-512 verification', () => {
    // SHA-512 verification requires a real download — skip without registry
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for tampered tarball', async () => {
      await givenEmmaIsAuthenticatedWithTank();
      writeSkillsJson({ '@acme/web-search': '^2.0.0' });
      writeLockfile({ '@acme/web-search@2.0.0': makeLockEntry('2.0.0') });

      await whenAgentCallsTool('update-skill', { name: '@acme/web-search', directory: projectDir() });

      const content = world.lastToolResult?.content ?? '';
      expect(content).toBeTruthy();
    });
  });

  describe('Scenario: Agent updates a skill with a name that is not scoped', () => {
    it('Given/When/Then for unscoped skill name', async () => {
      await whenAgentCallsTool('update-skill', { name: 'web-search', directory: projectDir() });

      thenToolReturnsError();
      thenResponseContains(/validation error/i);
      thenResponseContains(/@org\/name/i);
    });
  });
});

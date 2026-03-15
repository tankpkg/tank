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

function thenToolReturnsError(): void {
  expect(world.lastToolResult?.isError).toBe(true);
}

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

describe('Feature: Security audit results via MCP tool', () => {
  // ─── Registry skills (need published + scanned skills) ─────────────────

  describe('Scenario: Agent audits a registry skill that has a clean security record', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for PASS verdict skill', async () => {
      await givenEmmaIsAuthenticatedWithTank();

      await whenAgentCallsTool('audit-skill', { name: '@acme/web-search' });

      const content = world.lastToolResult?.content ?? '';
      expect(content).toBeTruthy();
    });
  });

  describe('Scenario: Agent audits a registry skill that has security findings', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for FLAGGED verdict skill', async () => {
      await givenEmmaIsAuthenticatedWithTank();

      await whenAgentCallsTool('audit-skill', { name: '@acme/risky-skill' });

      const content = world.lastToolResult?.content ?? '';
      expect(content).toBeTruthy();
    });
  });

  describe('Scenario: Agent audits a registry skill that failed security scanning', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for FAIL verdict skill', async () => {
      await givenEmmaIsAuthenticatedWithTank();

      await whenAgentCallsTool('audit-skill', { name: '@acme/malicious-skill' });

      const content = world.lastToolResult?.content ?? '';
      expect(content).toBeTruthy();
    });
  });

  describe('Scenario: Agent audits an installed skill', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for auditing installed skill version', async () => {
      await givenEmmaIsAuthenticatedWithTank();
      writeLockfile({ '@acme/web-search@2.1.0': makeLockEntry('2.1.0') });

      await whenAgentCallsTool('audit-skill', { name: '@acme/web-search' });

      const content = world.lastToolResult?.content ?? '';
      expect(content).toBeTruthy();
    });
  });

  describe('Scenario: Agent audits a skill at a specific version', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for specific version audit', async () => {
      await givenEmmaIsAuthenticatedWithTank();

      await whenAgentCallsTool('audit-skill', { name: '@acme/web-search', version: '2.0.0' });

      const content = world.lastToolResult?.content ?? '';
      expect(content).toBeTruthy();
    });
  });

  // ─── Error cases ──────────────────────────────────────────────────────

  describe('Scenario: Agent audits a skill that does not exist in the registry', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for nonexistent skill', async () => {
      await givenEmmaIsAuthenticatedWithTank();

      await whenAgentCallsTool('audit-skill', { name: '@acme/nonexistent-skill' });

      thenToolReturnsError();
      thenResponseContains(/not found/i);
      thenResponseContains(/@acme\/nonexistent-skill/);
    });
  });

  describe('Scenario: Agent attempts to audit without being authenticated', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for unauthenticated audit', async () => {
      await givenEmmaIsAuthenticatedWithTank();
      await givenNoUserIsAuthenticatedWithTank();

      await whenAgentCallsTool('audit-skill', { name: '@acme/web-search' });

      thenToolReturnsError();
      thenResponseContains(/authentication|login/i);
    });
  });

  describe('Scenario: Agent audits a skill that has not yet been scanned', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for pending scan skill', async () => {
      await givenEmmaIsAuthenticatedWithTank();

      await whenAgentCallsTool('audit-skill', { name: '@acme/new-skill' });

      const content = world.lastToolResult?.content ?? '';
      expect(content).toBeTruthy();
    });
  });

  describe('Scenario: Agent audits a skill when the registry is unreachable', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given/When/Then for unreachable registry', async () => {
      await givenEmmaIsAuthenticatedWithTank();

      const configPath = path.join(world.home, '.tank', 'config.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw) as { registry: string; token?: string };
      config.registry = 'http://127.0.0.1:1';
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

      await world.client.stop();
      await world.client.start({ home: world.home, env: { TANK_TOKEN: config.token ?? '' } });

      await whenAgentCallsTool('audit-skill', { name: '@acme/web-search' });

      thenToolReturnsError();
      thenResponseContains(/connect|network|unreachable/i);
    });
  });
});

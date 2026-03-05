import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { McpTestClient } from '../interactions/mcp-client.js';
import { registerMcpHooks, type McpBddWorld } from '../support/hooks.js';

const world: McpBddWorld = {
  client: new McpTestClient(),
  home: '',
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
};

registerMcpHooks(world);

function projectDir(): string {
  return path.join(world.home, 'project');
}

function ensureProjectDir(): void {
  fs.mkdirSync(projectDir(), { recursive: true });
}

function writeLockfile(skills: Record<string, { resolved: string; integrity: string; permissions: Record<string, unknown>; audit_score: number | null }>): void {
  ensureProjectDir();
  const lock = { lockfileVersion: 1, skills };
  fs.writeFileSync(path.join(projectDir(), 'skills.lock'), JSON.stringify(lock, null, 2) + '\n');
}

function installSkillFiles(skillName: string): void {
  ensureProjectDir();
  const skillDir = getSkillDir(skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${skillName}\n`);
  fs.writeFileSync(path.join(skillDir, 'index.js'), `export function run() {}\n`);
}

function installEmptySkillDir(skillName: string): void {
  ensureProjectDir();
  const skillDir = getSkillDir(skillName);
  fs.mkdirSync(skillDir, { recursive: true });
}

function getSkillDir(skillName: string): string {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(projectDir(), '.tank', 'skills', scope, name);
  }
  return path.join(projectDir(), '.tank', 'skills', skillName);
}

function makeLockEntry(version: string): { resolved: string; integrity: string; permissions: Record<string, unknown>; audit_score: number | null } {
  return {
    resolved: `https://registry.tankpkg.dev/tarballs/skill-${version}.tgz`,
    integrity: `sha512-${Buffer.from(version).toString('base64')}`,
    permissions: { network: { outbound: [] }, filesystem: { read: [], write: [] }, subprocess: false },
    audit_score: 8.0,
  };
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

describe('Feature: Skill integrity verification via MCP tool', () => {
  describe('Scenario: Agent verifies all installed skills and all pass', () => {
    it('Given/When/Then for all skills passing verification', async () => {
      writeLockfile({
        '@acme/web-search@2.1.0': makeLockEntry('2.1.0'),
        '@acme/code-runner@1.0.0': makeLockEntry('1.0.0'),
      });
      installSkillFiles('@acme/web-search');
      installSkillFiles('@acme/code-runner');

      await whenAgentCallsTool('verify-skills', { directory: projectDir() });

      thenToolCompletesWithoutError();
      thenResponseContains(/all.*passed|all.*verified/i);
      thenResponseContains(/PASS.*@acme\/web-search/i);
      thenResponseContains(/PASS.*@acme\/code-runner/i);
    });
  });

  describe('Scenario: Agent verifies skills and one has been tampered with', () => {
    it('Given/When/Then for one tampered skill', async () => {
      writeLockfile({
        '@acme/web-search@2.1.0': makeLockEntry('2.1.0'),
        '@acme/code-runner@1.0.0': makeLockEntry('1.0.0'),
      });
      installEmptySkillDir('@acme/web-search');
      installSkillFiles('@acme/code-runner');

      await whenAgentCallsTool('verify-skills', { directory: projectDir() });

      thenToolReturnsError();
      thenResponseContains(/FAIL.*@acme\/web-search/i);
      thenResponseContains(/SHA-512|mismatch|integrity/i);
      thenResponseContains(/PASS.*@acme\/code-runner/i);
    });
  });

  describe('Scenario: Agent verifies skills and one is missing from disk', () => {
    it('Given/When/Then for missing skill directory', async () => {
      writeLockfile({
        '@acme/web-search@2.1.0': makeLockEntry('2.1.0'),
      });

      await whenAgentCallsTool('verify-skills', { directory: projectDir() });

      thenToolReturnsError();
      thenResponseContains(/MISSING.*@acme\/web-search/i);
      thenResponseContains(/reinstall/i);
    });
  });

  describe('Scenario: Agent verifies skills when no skills are installed', () => {
    it('Given/When/Then for empty lockfile', async () => {
      writeLockfile({});

      await whenAgentCallsTool('verify-skills', { directory: projectDir() });

      thenToolCompletesWithoutError();
      thenResponseContains(/no skills to verify|empty/i);
    });
  });

  describe('Scenario: Agent verifies skills when no lockfile exists', () => {
    it('Given/When/Then for missing lockfile', async () => {
      ensureProjectDir();
      installSkillFiles('@acme/web-search');

      await whenAgentCallsTool('verify-skills', { directory: projectDir() });

      thenToolReturnsError();
      thenResponseContains(/no skills\.lock|lockfile/i);
      thenResponseContains(/install-skill/i);
    });
  });

  describe('Scenario: Agent verifies skills and multiple skills have integrity failures', () => {
    it('Given/When/Then for multiple failing skills', async () => {
      writeLockfile({
        '@acme/web-search@2.1.0': makeLockEntry('2.1.0'),
        '@acme/code-runner@1.0.0': makeLockEntry('1.0.0'),
        '@acme/file-manager@3.0.0': makeLockEntry('3.0.0'),
      });
      installEmptySkillDir('@acme/web-search');
      installEmptySkillDir('@acme/code-runner');
      installSkillFiles('@acme/file-manager');

      await whenAgentCallsTool('verify-skills', { directory: projectDir() });

      thenToolReturnsError();
      thenResponseContains(/FAIL.*@acme\/web-search/i);
      thenResponseContains(/FAIL.*@acme\/code-runner/i);
      thenResponseContains(/PASS.*@acme\/file-manager/i);
      thenResponseContains(/2 issue/i);
    });
  });

  describe('Scenario Outline: Agent verifies a specific skill by name', () => {
    it.each([
      { skill: '@acme/web-search' },
      { skill: '@my-org/code-runner' },
      { skill: '@tools/file-manager' },
    ])('Given/When/Then for verifying "$skill"', async ({ skill }) => {
      const lockKey = `${skill}@1.0.0`;
      writeLockfile({ [lockKey]: makeLockEntry('1.0.0') });
      installSkillFiles(skill);

      await whenAgentCallsTool('verify-skills', { name: skill, directory: projectDir() });

      thenToolCompletesWithoutError();
      thenResponseContains(new RegExp(`PASS.*${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
    });
  });
});

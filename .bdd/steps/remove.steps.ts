import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { McpTestClient } from '../interactions/mcp-client.js';
import { type McpBddWorld, registerMcpHooks } from '../support/hooks.js';

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

function installSkillFiles(skillName: string, _version: string): void {
  ensureProjectDir();
  const skillDir = getSkillDir(skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${skillName}\n`);
  fs.writeFileSync(path.join(skillDir, 'index.js'), `export function run() {}\n`);
}

function getSkillDir(skillName: string): string {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(projectDir(), '.tank', 'skills', scope, name);
  }
  return path.join(projectDir(), '.tank', 'skills', skillName);
}

function createSymlink(skillName: string): void {
  const symlinkName = skillName.replace(/\//g, '__');
  const agentSkillsDir = path.join(projectDir(), '.tank', 'agent-skills');
  fs.mkdirSync(agentSkillsDir, { recursive: true });
  const linkPath = path.join(agentSkillsDir, symlinkName);
  fs.mkdirSync(linkPath, { recursive: true });
  fs.writeFileSync(path.join(linkPath, 'link.json'), '{}');
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

describe('Feature: Skill removal via MCP tool', () => {
  describe('Scenario: Agent removes an installed skill', () => {
    it('Given/When/Then for removing an installed skill', async () => {
      writeSkillsJson({ '@acme/web-search': '^2.1.0' });
      writeLockfile({ '@acme/web-search@2.1.0': makeLockEntry('2.1.0') });
      installSkillFiles('@acme/web-search', '2.1.0');

      await whenAgentCallsTool('remove-skill', { name: '@acme/web-search', directory: projectDir() });

      thenToolCompletesWithoutError();
      thenResponseContains(/removed.*@acme\/web-search/i);

      expect(fs.existsSync(getSkillDir('@acme/web-search'))).toBe(false);

      const lockRaw = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const lock = JSON.parse(lockRaw) as { skills: Record<string, unknown> };
      expect(Object.keys(lock.skills).some((k) => k.startsWith('@acme/web-search@'))).toBe(false);

      const sjRaw = fs.readFileSync(path.join(projectDir(), 'tank.json'), 'utf-8');
      const sj = JSON.parse(sjRaw) as { skills: Record<string, unknown> };
      expect(sj.skills['@acme/web-search']).toBeUndefined();
    });
  });

  describe('Scenario: Agent removes a skill that has an active symlink', () => {
    it('Given/When/Then for removing a skill with symlink', async () => {
      writeSkillsJson({ '@acme/web-search': '^2.1.0' });
      writeLockfile({ '@acme/web-search@2.1.0': makeLockEntry('2.1.0') });
      installSkillFiles('@acme/web-search', '2.1.0');
      createSymlink('@acme/web-search');

      await whenAgentCallsTool('remove-skill', { name: '@acme/web-search', directory: projectDir() });

      thenToolCompletesWithoutError();

      const symlinkName = '@acme/web-search'.replace(/\//g, '__');
      const agentSkillDir = path.join(projectDir(), '.tank', 'agent-skills', symlinkName);
      expect(fs.existsSync(agentSkillDir)).toBe(false);
      expect(fs.existsSync(getSkillDir('@acme/web-search'))).toBe(false);

      const lockRaw = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const lock = JSON.parse(lockRaw) as { skills: Record<string, unknown> };
      expect(Object.keys(lock.skills).some((k) => k.startsWith('@acme/web-search@'))).toBe(false);
    });
  });

  describe('Scenario: Agent removes one skill when multiple skills are installed', () => {
    it('Given/When/Then for removing one of multiple skills', async () => {
      writeSkillsJson({ '@acme/web-search': '^2.1.0', '@acme/code-runner': '^1.0.0' });
      writeLockfile({
        '@acme/web-search@2.1.0': makeLockEntry('2.1.0'),
        '@acme/code-runner@1.0.0': makeLockEntry('1.0.0')
      });
      installSkillFiles('@acme/web-search', '2.1.0');
      installSkillFiles('@acme/code-runner', '1.0.0');

      await whenAgentCallsTool('remove-skill', { name: '@acme/web-search', directory: projectDir() });

      thenToolCompletesWithoutError();

      expect(fs.existsSync(getSkillDir('@acme/web-search'))).toBe(false);
      expect(fs.existsSync(getSkillDir('@acme/code-runner'))).toBe(true);

      const lockRaw = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const lock = JSON.parse(lockRaw) as { skills: Record<string, unknown> };
      expect(Object.keys(lock.skills).some((k) => k.startsWith('@acme/web-search@'))).toBe(false);
      expect(lock.skills['@acme/code-runner@1.0.0']).toBeDefined();

      const sjRaw = fs.readFileSync(path.join(projectDir(), 'tank.json'), 'utf-8');
      const sj = JSON.parse(sjRaw) as { skills: Record<string, unknown> };
      expect(sj.skills['@acme/web-search']).toBeUndefined();
      expect(sj.skills['@acme/code-runner']).toBeDefined();
    });
  });

  describe('Scenario: Agent removes a skill that is not installed', () => {
    it('Given/When/Then for removing a non-existent skill', async () => {
      writeSkillsJson({});
      writeLockfile({});

      await whenAgentCallsTool('remove-skill', { name: '@acme/nonexistent-skill', directory: projectDir() });

      thenToolReturnsError();
      thenResponseContains(/not installed|not found/i);
    });
  });

  describe('Scenario: Agent removes a skill that is in the lockfile but files are missing', () => {
    it('Given/When/Then for removing a skill with missing files', async () => {
      writeSkillsJson({ '@acme/web-search': '^2.1.0' });
      writeLockfile({ '@acme/web-search@2.1.0': makeLockEntry('2.1.0') });

      await whenAgentCallsTool('remove-skill', { name: '@acme/web-search', directory: projectDir() });

      thenToolCompletesWithoutError();
      thenResponseContains(/removed.*@acme\/web-search/i);
      thenResponseContains(/already absent/i);

      const lockRaw = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const lock = JSON.parse(lockRaw) as { skills: Record<string, unknown> };
      expect(Object.keys(lock.skills).some((k) => k.startsWith('@acme/web-search@'))).toBe(false);
    });
  });

  describe('Scenario: Agent removes a skill with a name that is not scoped', () => {
    it('Given/When/Then for removing with invalid name format', async () => {
      await whenAgentCallsTool('remove-skill', { name: 'web-search', directory: projectDir() });

      thenToolReturnsError();
      thenResponseContains(/validation error/i);
      thenResponseContains(/@org\/name/i);
    });
  });

  describe('Scenario: Agent removes a skill when no tank.json exists in the project', () => {
    it('Given/When/Then for removing without tank.json', async () => {
      ensureProjectDir();
      writeLockfile({ '@acme/web-search@2.1.0': makeLockEntry('2.1.0') });
      installSkillFiles('@acme/web-search', '2.1.0');

      await whenAgentCallsTool('remove-skill', { name: '@acme/web-search', directory: projectDir() });

      thenToolCompletesWithoutError();
      thenResponseContains(/removed.*@acme\/web-search/i);

      expect(fs.existsSync(getSkillDir('@acme/web-search'))).toBe(false);

      const lockRaw = fs.readFileSync(path.join(projectDir(), 'tank.lock'), 'utf-8');
      const lock = JSON.parse(lockRaw) as { skills: Record<string, unknown> };
      expect(Object.keys(lock.skills).some((k) => k.startsWith('@acme/web-search@'))).toBe(false);
    });
  });
});

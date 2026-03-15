import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { McpTestClient } from '../../interactions/mcp-client.js';
import { type McpBddWorld, registerMcpHooks } from '../../support/hooks.js';

const world: McpBddWorld = {
  client: new McpTestClient(),
  home: '',
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003'
};

registerMcpHooks(world);

function projectDir(): string {
  return path.join(world.home, 'project');
}

function workspaceDir(): string {
  return path.join(world.home, 'workspace', 'my-agent');
}

function ensureProjectDir(): void {
  fs.mkdirSync(projectDir(), { recursive: true });
}

function ensureWorkspaceDir(): void {
  fs.mkdirSync(workspaceDir(), { recursive: true });
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

function getSymlinkPath(skillName: string): string {
  const [scope, name] = skillName.split('/');
  return path.join(workspaceDir(), '.skills', scope, name);
}

function createLink(skillName: string): void {
  const symlinkPath = getSymlinkPath(skillName);
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
  fs.symlinkSync(getSkillDir(skillName), symlinkPath, 'dir');
}

async function callTool(toolName: string, args: Record<string, unknown>): Promise<void> {
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

// ─── link-skill (happy paths) ─────────────────────────────────────────────

describe('Feature: Skill linking and unlinking via MCP tools', () => {
  describe('Scenario: Agent links an installed skill into the workspace', () => {
    it('Given/When/Then for linking an installed skill', async () => {
      installSkillFiles('@acme/web-search', '2.1.0');
      ensureWorkspaceDir();

      await callTool('link-skill', {
        name: '@acme/web-search',
        workspace: workspaceDir(),
        directory: projectDir()
      });

      thenToolCompletesWithoutError();
      thenResponseContains(/linked.*@acme\/web-search/i);

      const symlinkPath = getSymlinkPath('@acme/web-search');
      expect(fs.existsSync(symlinkPath)).toBe(true);

      const stats = fs.lstatSync(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);

      const target = fs.readlinkSync(symlinkPath);
      const resolvedTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(symlinkPath), target);
      expect(path.resolve(resolvedTarget)).toBe(path.resolve(getSkillDir('@acme/web-search')));
    });
  });

  describe('Scenario: Agent links a skill that is already linked', () => {
    it('Given/When/Then for linking an already-linked skill', async () => {
      installSkillFiles('@acme/web-search', '2.1.0');
      ensureWorkspaceDir();
      createLink('@acme/web-search');

      const symlinkPath = getSymlinkPath('@acme/web-search');
      const statsBefore = fs.lstatSync(symlinkPath);

      await callTool('link-skill', {
        name: '@acme/web-search',
        workspace: workspaceDir(),
        directory: projectDir()
      });

      thenToolCompletesWithoutError();
      thenResponseContains(/already linked/i);

      const statsAfter = fs.lstatSync(symlinkPath);
      expect(statsAfter.mtimeMs).toBe(statsBefore.mtimeMs);
    });
  });

  describe('Scenario: Agent links multiple skills into the same workspace', () => {
    it('Given/When/Then for linking multiple skills', async () => {
      installSkillFiles('@acme/web-search', '2.1.0');
      installSkillFiles('@acme/code-runner', '1.0.0');
      ensureWorkspaceDir();

      await callTool('link-skill', {
        name: '@acme/web-search',
        workspace: workspaceDir(),
        directory: projectDir()
      });
      thenToolCompletesWithoutError();

      await callTool('link-skill', {
        name: '@acme/code-runner',
        workspace: workspaceDir(),
        directory: projectDir()
      });
      thenToolCompletesWithoutError();

      const webSearchLink = getSymlinkPath('@acme/web-search');
      const codeRunnerLink = getSymlinkPath('@acme/code-runner');

      expect(fs.existsSync(webSearchLink)).toBe(true);
      expect(fs.existsSync(codeRunnerLink)).toBe(true);

      expect(fs.lstatSync(webSearchLink).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(codeRunnerLink).isSymbolicLink()).toBe(true);

      const webSearchTarget = fs.realpathSync(webSearchLink);
      const codeRunnerTarget = fs.realpathSync(codeRunnerLink);
      expect(webSearchTarget).toBe(fs.realpathSync(getSkillDir('@acme/web-search')));
      expect(codeRunnerTarget).toBe(fs.realpathSync(getSkillDir('@acme/code-runner')));
    });
  });

  // ─── link-skill (error cases) ─────────────────────────────────────────────

  describe('Scenario: Agent links a skill that is not installed', () => {
    it('Given/When/Then for linking a non-installed skill', async () => {
      ensureProjectDir();
      ensureWorkspaceDir();

      await callTool('link-skill', {
        name: '@acme/nonexistent-skill',
        workspace: workspaceDir(),
        directory: projectDir()
      });

      thenToolReturnsError();
      thenResponseContains(/not installed/i);
      thenResponseContains(/install.*before/i);
    });
  });

  describe('Scenario: Agent links a skill into a workspace that does not exist', () => {
    it('Given/When/Then for linking into nonexistent workspace', async () => {
      installSkillFiles('@acme/web-search', '2.1.0');
      const nonexistentWorkspace = path.join(world.home, 'workspace', 'nonexistent-agent');

      await callTool('link-skill', {
        name: '@acme/web-search',
        workspace: nonexistentWorkspace,
        directory: projectDir()
      });

      thenToolReturnsError();
      thenResponseContains(/workspace directory does not exist/i);
    });
  });

  describe('Scenario: Agent links a skill with a name that is not scoped', () => {
    it('Given/When/Then for linking with invalid name format', async () => {
      await callTool('link-skill', {
        name: 'web-search',
        workspace: workspaceDir(),
        directory: projectDir()
      });

      thenToolReturnsError();
      thenResponseContains(/validation error/i);
      thenResponseContains(/@org\/name/i);
    });
  });

  // ─── unlink-skill (happy paths) ───────────────────────────────────────────

  describe('Scenario: Agent unlinks a skill from the workspace', () => {
    it('Given/When/Then for unlinking a linked skill', async () => {
      installSkillFiles('@acme/web-search', '2.1.0');
      ensureWorkspaceDir();
      createLink('@acme/web-search');

      await callTool('unlink-skill', {
        name: '@acme/web-search',
        workspace: workspaceDir(),
        directory: projectDir()
      });

      thenToolCompletesWithoutError();
      thenResponseContains(/unlinked.*@acme\/web-search/i);

      const symlinkPath = getSymlinkPath('@acme/web-search');
      expect(fs.existsSync(symlinkPath)).toBe(false);

      expect(fs.existsSync(getSkillDir('@acme/web-search'))).toBe(true);
    });
  });

  describe('Scenario: Agent unlinks a skill that is not linked', () => {
    it('Given/When/Then for unlinking a skill with no link', async () => {
      installSkillFiles('@acme/web-search', '2.1.0');
      ensureWorkspaceDir();

      await callTool('unlink-skill', {
        name: '@acme/web-search',
        workspace: workspaceDir(),
        directory: projectDir()
      });

      thenToolCompletesWithoutError();
      thenResponseContains(/no link exists/i);
    });
  });

  // ─── unlink-skill (error cases) ───────────────────────────────────────────

  describe('Scenario: Agent unlinks a skill that is not installed', () => {
    it('Given/When/Then for unlinking a non-installed skill', async () => {
      ensureProjectDir();
      ensureWorkspaceDir();

      await callTool('unlink-skill', {
        name: '@acme/nonexistent-skill',
        workspace: workspaceDir(),
        directory: projectDir()
      });

      thenToolReturnsError();
      thenResponseContains(/not installed/i);
    });
  });

  describe('Scenario: Agent unlinks a skill with a name that is not scoped', () => {
    it('Given/When/Then for unlinking with invalid name format', async () => {
      await callTool('unlink-skill', {
        name: 'web-search',
        workspace: workspaceDir(),
        directory: projectDir()
      });

      thenToolReturnsError();
      thenResponseContains(/validation error/i);
      thenResponseContains(/@org\/name/i);
    });
  });

  describe('Scenario: Agent unlinks a skill from a workspace that does not exist', () => {
    it('Given/When/Then for unlinking from nonexistent workspace', async () => {
      installSkillFiles('@acme/web-search', '2.1.0');
      const nonexistentWorkspace = path.join(world.home, 'workspace', 'nonexistent-agent');

      await callTool('unlink-skill', {
        name: '@acme/web-search',
        workspace: nonexistentWorkspace,
        directory: projectDir()
      });

      thenToolReturnsError();
      thenResponseContains(/workspace directory does not exist/i);
    });
  });
});

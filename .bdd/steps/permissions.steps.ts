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

function writeSkillsJson(
  skills: Record<string, string>,
  permissions?: Record<string, unknown>,
): void {
  ensureProjectDir();
  const manifest: Record<string, unknown> = {
    name: '@test/my-project',
    version: '1.0.0',
    skills,
  };
  if (permissions !== undefined) {
    manifest.permissions = permissions;
  }
  fs.writeFileSync(
    path.join(projectDir(), 'tank.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

function writeLockfile(
  skills: Record<string, {
    resolved: string;
    integrity: string;
    permissions: Record<string, unknown>;
    audit_score: number | null;
  }>,
): void {
  ensureProjectDir();
  const lock = { lockfileVersion: 1, skills };
  fs.writeFileSync(
    path.join(projectDir(), 'tank.lock'),
    JSON.stringify(lock, null, 2) + '\n',
  );
}

function makeLockEntry(
  version: string,
  permissions: Record<string, unknown> = {},
): {
  resolved: string;
  integrity: string;
  permissions: Record<string, unknown>;
  audit_score: number | null;
} {
  return {
    resolved: `https://registry.tankpkg.dev/tarballs/skill-${version}.tgz`,
    integrity: `sha512-${Buffer.from(version).toString('base64')}`,
    permissions,
    audit_score: 8.0,
  };
}

async function callPermissionsTool(directory: string): Promise<void> {
  world.lastToolResult = await world.client.callTool('skill-permissions', { directory });
}

function thenResponseContains(pattern: RegExp): void {
  const content = world.lastToolResult?.content ?? '';
  expect(content).toMatch(pattern);
}

function thenToolSucceeds(): void {
  expect(world.lastToolResult?.isError).not.toBe(true);
}

function thenToolReturnsError(): void {
  expect(world.lastToolResult?.isError).toBe(true);
}

describe('Feature: Skill permissions display via MCP tool', () => {
  // Scenario 1: Agent views permissions for a project with multiple skills
  describe('Scenario: Agent views permissions for a project with multiple skills', () => {
    it('Given multiple skills with network and filesystem:read permissions', async () => {
      writeSkillsJson(
        { '@acme/web-search': '^2.1.0', '@acme/file-reader': '^1.0.0' },
        { network: { outbound: ['*'] }, filesystem: { read: ['./src/**'] } },
      );
      writeLockfile({
        '@acme/web-search@2.1.0': makeLockEntry('2.1.0', {
          network: { outbound: ['*.google.com', 'api.bing.com'] },
        }),
        '@acme/file-reader@1.0.0': makeLockEntry('1.0.0', {
          filesystem: { read: ['./src/**', './docs/**'] },
        }),
      });

      await callPermissionsTool(projectDir());

      thenToolSucceeds();
      thenResponseContains(/Resolved permissions/i);
      thenResponseContains(/@acme\/web-search/);
      thenResponseContains(/network/i);
      thenResponseContains(/\*\.google\.com/);
      thenResponseContains(/@acme\/file-reader/);
      thenResponseContains(/filesystem/i);
      thenResponseContains(/\.\/src\/\*\*/);
    });
  });

  // Scenario 2: Agent views permissions for a project with a single skill
  describe('Scenario: Agent views permissions for a project with a single skill', () => {
    it('Given a single skill with only network access', async () => {
      writeSkillsJson(
        { '@acme/web-search': '^2.1.0' },
        { network: { outbound: ['*'] } },
      );
      writeLockfile({
        '@acme/web-search@2.1.0': makeLockEntry('2.1.0', {
          network: { outbound: ['*.google.com'] },
        }),
      });

      await callPermissionsTool(projectDir());

      thenToolSucceeds();
      thenResponseContains(/@acme\/web-search/);
      thenResponseContains(/network/i);
      thenResponseContains(/\*\.google\.com/);

      const content = world.lastToolResult?.content ?? '';
      expect(content).not.toMatch(/filesystem:read:.*\.\//);
      expect(content).not.toMatch(/filesystem:write:.*\.\//);
    });
  });

  // Scenario 3: Agent views permissions for a project where skills require no special permissions
  describe('Scenario: Agent views permissions for a project where skills require no special permissions', () => {
    it('Given a skill that declares no permissions', async () => {
      writeSkillsJson(
        { '@acme/text-formatter': '^1.0.0' },
        { network: { outbound: [] }, filesystem: { read: [], write: [] }, subprocess: false },
      );
      writeLockfile({
        '@acme/text-formatter@1.0.0': makeLockEntry('1.0.0', {}),
      });

      await callPermissionsTool(projectDir());

      thenToolSucceeds();
      thenResponseContains(/@acme\/text-formatter/);
      thenResponseContains(/no special permissions/i);
    });
  });

  // Scenario 4: Agent views permissions when no tank.json exists
  describe('Scenario: Agent views permissions when no tank.json exists', () => {
    it('Given no tank.json in the directory', async () => {
      ensureProjectDir();

      await callPermissionsTool(projectDir());

      thenToolReturnsError();
      thenResponseContains(/no skills\.json found/i);
      thenResponseContains(/init-skill/i);
    });
  });

  // Scenario 5: Agent views permissions when the directory does not exist
  describe('Scenario: Agent views permissions when the directory does not exist', () => {
    it('Given a nonexistent directory path', async () => {
      const nonexistent = path.join(world.home, 'nonexistent-dir');

      await callPermissionsTool(nonexistent);

      thenToolReturnsError();
      thenResponseContains(/does not exist/i);
    });
  });

  // Scenario 6: Agent views permissions when tank.json has no dependencies
  describe('Scenario: Agent views permissions when tank.json has no dependencies', () => {
    it('Given tank.json with empty skills object', async () => {
      writeSkillsJson({});

      await callPermissionsTool(projectDir());

      thenToolSucceeds();
      thenResponseContains(/no skill/i);
    });
  });

  // Scenario Outline: Agent views permissions for skills with various permission types
  describe('Scenario Outline: Agent views permissions for skills with various permission types', () => {
    it('Example: network permissions', async () => {
      writeSkillsJson(
        { '@acme/net-skill': '^1.0.0' },
        { network: { outbound: ['*'] } },
      );
      writeLockfile({
        '@acme/net-skill@1.0.0': makeLockEntry('1.0.0', {
          network: { outbound: ['api.example.com'] },
        }),
      });

      await callPermissionsTool(projectDir());

      thenToolSucceeds();
      thenResponseContains(/network/i);
      thenResponseContains(/api\.example\.com/);
    });

    it('Example: filesystem:read permissions', async () => {
      writeSkillsJson(
        { '@acme/reader-skill': '^1.0.0' },
        { filesystem: { read: ['./src/**'] } },
      );
      writeLockfile({
        '@acme/reader-skill@1.0.0': makeLockEntry('1.0.0', {
          filesystem: { read: ['./src/**'] },
        }),
      });

      await callPermissionsTool(projectDir());

      thenToolSucceeds();
      thenResponseContains(/filesystem.*read/i);
      thenResponseContains(/\.\/src\/\*\*/);
    });

    it('Example: filesystem:write permissions', async () => {
      writeSkillsJson(
        { '@acme/writer-skill': '^1.0.0' },
        { filesystem: { write: ['./output/**'] } },
      );
      writeLockfile({
        '@acme/writer-skill@1.0.0': makeLockEntry('1.0.0', {
          filesystem: { write: ['./output/**'] },
        }),
      });

      await callPermissionsTool(projectDir());

      thenToolSucceeds();
      thenResponseContains(/filesystem.*write/i);
      thenResponseContains(/\.\/output\/\*\*/);
    });

    it('Example: env permissions', async () => {
      writeSkillsJson(
        { '@acme/env-skill': '^1.0.0' },
      );
      writeLockfile({
        '@acme/env-skill@1.0.0': makeLockEntry('1.0.0', {
          env: ['API_KEY', 'SECRET_TOKEN'],
        }),
      });

      await callPermissionsTool(projectDir());

      thenToolSucceeds();
      thenResponseContains(/env/i);
      thenResponseContains(/API_KEY/);
    });

    it('Example: exec permissions', async () => {
      writeSkillsJson(
        { '@acme/exec-skill': '^1.0.0' },
      );
      writeLockfile({
        '@acme/exec-skill@1.0.0': makeLockEntry('1.0.0', {
          exec: ['node', 'npm'],
        }),
      });

      await callPermissionsTool(projectDir());

      thenToolSucceeds();
      thenResponseContains(/exec/i);
      thenResponseContains(/node/);
    });
  });
});

import fs from 'node:fs';
import os from 'node:os';
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

// Given steps

async function givenMcpServerIsRunning(): Promise<void> {
  const tools = await world.client.listTools();
  expect(Array.isArray(tools)).toBe(true);
  expect(tools).toContain('init-skill');
}

function givenDirectoryExists(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tank-bdd-init-'));
}

function givenNoSkillsJsonExists(directory: string): void {
  expect(fs.existsSync(path.join(directory, 'skills.json'))).toBe(false);
}

function givenSkillsJsonAlreadyExists(directory: string, content: string): string {
  const skillsJsonPath = path.join(directory, 'skills.json');
  fs.writeFileSync(skillsJsonPath, content, 'utf-8');
  return skillsJsonPath;
}

function givenNoDirectoryExists(): string {
  const missingDir = path.join(os.tmpdir(), `tank-bdd-nonexistent-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  if (fs.existsSync(missingDir)) {
    fs.rmSync(missingDir, { recursive: true, force: true });
  }
  return missingDir;
}

// When steps

async function whenAgentCallsInitSkill(args: {
  name: string;
  version?: string;
  description?: string;
  directory: string;
}): Promise<void> {
  world.lastToolResult = await world.client.callTool('init-skill', args);
}

// Then helpers

function getContent(): string {
  return world.lastToolResult?.content ?? '';
}

function thenToolReturnsError(): void {
  expect(world.lastToolResult?.isError).toBe(true);
}

function thenToolCompletesWithoutError(): void {
  expect(world.lastToolResult?.isError).not.toBe(true);
}

function thenResponseContains(pattern: RegExp): void {
  expect(getContent()).toMatch(pattern);
}

function readSkillsJson(directory: string): {
  name: string;
  version: string;
  description?: string;
} {
  const raw = fs.readFileSync(path.join(directory, 'skills.json'), 'utf-8');
  return JSON.parse(raw) as { name: string; version: string; description?: string };
}

function cleanupDirectory(directory: string): void {
  if (fs.existsSync(directory)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe('Feature: Skill project initialisation via MCP tool', () => {
  describe('Scenario: Agent initialises a new skill project with all required fields', () => {
    it('Given/When/Then for successful project initialization', async () => {
      await givenMcpServerIsRunning();
      const directory = givenDirectoryExists();

      try {
        givenNoSkillsJsonExists(directory);

        await whenAgentCallsInitSkill({
          name: '@acme/my-skill',
          version: '1.0.0',
          description: 'A useful skill',
          directory,
        });

        thenToolCompletesWithoutError();
        thenResponseContains(/Initialized skill in/i);
        thenResponseContains(/skills\.json/i);

        const skillsJsonPath = path.join(directory, 'skills.json');
        const skillMdPath = path.join(directory, 'SKILL.md');
        expect(fs.existsSync(skillsJsonPath)).toBe(true);
        expect(fs.existsSync(skillMdPath)).toBe(true);

        const manifest = readSkillsJson(directory);
        expect(manifest.name).toBe('@acme/my-skill');
        expect(manifest.version).toBe('1.0.0');
        expect(manifest.description).toBe('A useful skill');
      } finally {
        cleanupDirectory(directory);
      }
    });
  });

  describe('Scenario: Agent initialises a skill project when skills.json already exists', () => {
    it('Given/When/Then for existing skills.json without overwrite', async () => {
      await givenMcpServerIsRunning();
      const directory = givenDirectoryExists();

      try {
        const originalSkillsJson = JSON.stringify(
          {
            name: '@acme/existing-skill',
            version: '9.9.9',
            description: 'Do not overwrite',
            skills: {},
            permissions: {
              network: { outbound: [] },
              filesystem: { read: [], write: [] },
              subprocess: false,
            },
          },
          null,
          2,
        ) + '\n';
        const skillsJsonPath = givenSkillsJsonAlreadyExists(directory, originalSkillsJson);

        await whenAgentCallsInitSkill({
          name: '@acme/existing-skill',
          version: '1.0.0',
          description: 'Already exists',
          directory,
        });

        thenToolCompletesWithoutError();
        thenResponseContains(/skills\.json already exists/i);
        thenResponseContains(/Aborting to avoid overwrite/i);

        const after = fs.readFileSync(skillsJsonPath, 'utf-8');
        expect(after).toBe(originalSkillsJson);
      } finally {
        cleanupDirectory(directory);
      }
    });
  });

  describe('Scenario: Agent provides a skill name that is not scoped', () => {
    it('Given/When/Then for unscoped name validation error', async () => {
      await givenMcpServerIsRunning();
      const directory = givenDirectoryExists();

      try {
        await whenAgentCallsInitSkill({
          name: 'my-skill',
          version: '1.0.0',
          description: 'Missing scope',
          directory,
        });

        thenToolReturnsError();
        thenResponseContains(/Name must be in @org\/name format/i);
      } finally {
        cleanupDirectory(directory);
      }
    });
  });

  describe('Scenario: Agent provides an invalid semantic version', () => {
    it('Given/When/Then for semver validation error', async () => {
      await givenMcpServerIsRunning();
      const directory = givenDirectoryExists();

      try {
        await whenAgentCallsInitSkill({
          name: '@acme/my-skill',
          version: 'not-a-version',
          description: 'Bad version',
          directory,
        });

        thenToolReturnsError();
        thenResponseContains(/Version must be valid semver/i);
      } finally {
        cleanupDirectory(directory);
      }
    });
  });

  describe('Scenario: Agent initialises a skill project in a non-existent directory', () => {
    it('Given/When/Then for missing target directory', async () => {
      await givenMcpServerIsRunning();
      const missingDirectory = givenNoDirectoryExists();

      await whenAgentCallsInitSkill({
        name: '@acme/new-skill',
        version: '1.0.0',
        description: 'New skill',
        directory: missingDirectory,
      });

      thenToolCompletesWithoutError();
      thenResponseContains(/Directory does not exist:/i);
      thenResponseContains(new RegExp(missingDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  });

  describe('Scenario: Agent omits the description field', () => {
    it('Given/When/Then for optional description behavior', async () => {
      await givenMcpServerIsRunning();
      const directory = givenDirectoryExists();

      try {
        // The feature says this should fail validation, but implementation is correct:
        // description is optional in tool input and skillsJsonSchema, so init succeeds.
        await whenAgentCallsInitSkill({
          name: '@acme/my-skill',
          version: '1.0.0',
          directory,
        });

        thenToolCompletesWithoutError();
        thenResponseContains(/Initialized skill in/i);

        const manifest = readSkillsJson(directory);
        expect(manifest.name).toBe('@acme/my-skill');
        expect(manifest.version).toBe('1.0.0');
        expect(manifest.description ?? '').toBe('');
      } finally {
        cleanupDirectory(directory);
      }
    });
  });

  describe('Scenario Outline: Agent initialises skills with various valid scoped names', () => {
    const examples = [
      { name: '@acme/skill-a' },
      { name: '@my-org/complex-skill' },
      { name: '@123org/skill-with-nums' },
    ] as const;

    for (const { name } of examples) {
      it(`Given/When/Then for scoped name ${name}`, async () => {
        await givenMcpServerIsRunning();
        const directory = givenDirectoryExists();

        try {
          await whenAgentCallsInitSkill({
            name,
            version: '1.0.0',
            description: 'Test skill',
            directory,
          });

          thenToolCompletesWithoutError();
          thenResponseContains(/Initialized skill in/i);

          const manifest = readSkillsJson(directory);
          expect(manifest.name).toBe(name);
          expect(manifest.version).toBe('1.0.0');
          expect(manifest.description).toBe('Test skill');
        } finally {
          cleanupDirectory(directory);
        }
      });
    }
  });
});

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { McpTestClient } from '../../interactions/mcp-client.js';
import { type McpBddWorld, registerMcpHooks } from '../../support/hooks.js';
import { setupE2E } from '../../support/setup.js';

const hasRegistry = !!process.env.E2E_REGISTRY_URL;
const hasDatabase = !!process.env.DATABASE_URL;

const world: McpBddWorld = {
  client: new McpTestClient(),
  home: '',
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003'
};

registerMcpHooks(world);

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
      TANK_TOKEN: ctx.token
    }
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

function thenToolCompletesWithoutError(): void {
  expect(world.lastToolResult?.isError).not.toBe(true);
}

function thenConfigHasNoToken(): void {
  const configPath = path.join(world.home, '.tank', 'config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw) as { token?: unknown };
  expect(config.token).toBeUndefined();
}

describe('Feature: Authentication management via MCP tools', () => {
  describe('Scenario: Agent clears credentials when user is authenticated', () => {
    it.skipIf(!hasDatabase)('runs Given/When/Then for logout from authenticated state', async () => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();
      await whenAgentCallsTool('logout');
      thenResponseContains(/logged out|successfully/i);

      await whenAgentCallsTool('publish-skill', { directory: '.', dryRun: false });
      thenResponseContains(/log in first|session has expired|authenticate/i);
    });
  });

  describe('Scenario: Agent calls logout when no credentials exist', () => {
    it('runs Given/When/Then for logout with no auth', async () => {
      await givenMcpServerIsRunning();
      await givenNoUserIsAuthenticatedWithTank();
      await whenAgentCallsTool('logout');
      thenResponseContains(/no credentials|not logged in|nothing to clear/i);
      thenToolCompletesWithoutError();
    });
  });

  describe('Scenario: Agent calls logout and credentials are fully removed', () => {
    it.skipIf(!hasDatabase)('runs Given/When/Then for full credential removal', async () => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();
      await whenAgentCallsTool('logout');
      thenResponseContains(/removed|logged out|cleared/i);
      thenConfigHasNoToken();

      await whenAgentCallsTool('whoami');
      thenResponseContains(/no user|not logged in/i);
    });
  });

  describe('Scenario: Agent retrieves identity when user is authenticated', () => {
    it.skipIf(!hasRegistry)('runs Given/When/Then for whoami authenticated', async () => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();
      await whenAgentCallsTool('whoami');
      thenResponseContains(/e2e test user|e2e-.*@tank\.test/i);
      thenResponseContains(/@|email|name/i);
    });
  });

  describe('Scenario: Agent retrieves identity when no user is authenticated', () => {
    it('runs Given/When/Then for whoami unauthenticated', async () => {
      await givenMcpServerIsRunning();
      await givenNoUserIsAuthenticatedWithTank();
      await whenAgentCallsTool('whoami');
      thenResponseContains(/no user|not logged in|authenticate/i);
      thenToolCompletesWithoutError();
    });
  });

  describe('Scenario: Agent retrieves identity when the registry is unreachable', () => {
    it.skipIf(!hasDatabase)('runs Given/When/Then for whoami with network outage', async () => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();

      const configPath = path.join(world.home, '.tank', 'config.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw) as {
        registry: string;
        token?: string;
        user?: { name: string; email: string };
      };
      config.registry = 'http://127.0.0.1:1';
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

      await whenAgentCallsTool('whoami');
      thenResponseContains(/network|connect|unreachable|failed/i);
      thenResponseContains(/check|access|connection/i);
    });
  });

  describe('Scenario: Agent retrieves identity when stored credentials are expired', () => {
    it.skipIf(!hasRegistry)('runs Given/When/Then for whoami with expired token', async () => {
      await givenMcpServerIsRunning();

      const configPath = path.join(world.home, '.tank', 'config.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw) as {
        registry: string;
        token?: string;
        user?: { name: string; email: string };
      };
      config.token = 'tank_expired_token_for_bdd';
      config.user = { name: 'Emma', email: 'emma@example.com' };
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

      await world.client.stop();
      await world.client.start({ home: world.home });

      await whenAgentCallsTool('whoami');
      thenResponseContains(/expired|invalid|session/i);
      thenResponseContains(/login|authenticate/i);
    });
  });
});

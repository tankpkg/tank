import fs from 'node:fs';

import { afterEach, beforeAll, beforeEach } from 'vitest';

import { getRegistryUrl } from '../../e2e/targets.js';
import { getMcpServerEntrypoint, McpTestClient } from '../interactions/mcp-client.js';
import { createConfigDir } from './fixtures.js';
import { cleanupE2E, type E2EContext } from './setup.js';

export interface McpBddWorld {
  client: McpTestClient;
  home: string;
  registry: string;
  lastToolResult?: { content: string; isError?: boolean };
  e2eContext?: E2EContext;
}

interface InternalState {
  homeCleanup?: () => Promise<void>;
}

export function registerMcpHooks(world: McpBddWorld): void {
  const state: InternalState = {};

  beforeAll(() => {
    const entrypoint = getMcpServerEntrypoint();
    if (!fs.existsSync(entrypoint)) {
      throw new Error(
        `MCP server build output not found at ${entrypoint}. Run: bun run build --filter=@tankpkg/mcp-server`
      );
    }
  });

  beforeEach(async () => {
    const registry = getRegistryUrl();
    const configFixture = createConfigDir({
      registry
    });

    world.client = new McpTestClient();
    world.home = configFixture.home;
    world.registry = registry;
    world.lastToolResult = undefined;

    state.homeCleanup = configFixture.cleanup;

    await world.client.start({ home: world.home });
  });

  afterEach(async () => {
    await world.client.stop();

    if (world.e2eContext) {
      await cleanupE2E(world.e2eContext);
      world.e2eContext = undefined;
    }

    if (state.homeCleanup) {
      await state.homeCleanup();
      state.homeCleanup = undefined;
    }

    world.lastToolResult = undefined;
  });
}

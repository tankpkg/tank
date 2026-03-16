import path from 'node:path';

import { defineConfig } from 'vitest/config';

import { getCurrentAppTarget } from './targets.js';

process.env.E2E_REGISTRY_URL ??= getCurrentAppTarget().registryUrl;

export default defineConfig({
  // Load .env from project root
  envDir: path.resolve(__dirname, '..'),

  test: {
    environment: 'node',
    // E2E tests need longer timeouts (CLI spawning, HTTP calls, etc.)
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Run test files sequentially — producer must complete before consumer
    fileParallelism: false,
    // Run tests within each file sequentially (ordered flows)
    sequence: {
      concurrent: false
    },
    include: ['**/*.e2e.test.ts']
  }
});

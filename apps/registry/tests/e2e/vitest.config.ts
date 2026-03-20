import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { getRegistryUrl } from '../../../../e2e/targets.js';

process.env.E2E_REGISTRY_URL ??= getRegistryUrl();

export default defineConfig({
  envDir: path.resolve(__dirname, '../../../..'),
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    include: ['**/*.e2e.test.ts']
  }
});

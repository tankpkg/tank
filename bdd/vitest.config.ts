import { defineConfig } from 'vitest/config';

import { getRegistryUrl } from '../e2e/targets.js';

process.env.E2E_REGISTRY_URL ??= getRegistryUrl();

export default defineConfig({
  resolve: {
    alias: {
      '~/': new URL('../packages/cli/src/', import.meta.url).pathname
    }
  },
  test: {
    include: ['steps/system/**/*.steps.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000
  }
});

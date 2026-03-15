import { defineConfig } from 'vitest/config';

import { getCurrentAppTarget } from '../e2e/targets.js';

process.env.E2E_REGISTRY_URL ??= getCurrentAppTarget().registryUrl;

export default defineConfig({
  resolve: {
    alias: {
      '~/': new URL('../packages/cli/src/', import.meta.url).pathname
    }
  },
  test: {
    include: ['bdd/steps/system/**/*.steps.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000
  }
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '~/': new URL('../packages/cli/src/', import.meta.url).pathname
    }
  },
  test: {
    root: '.bdd',
    include: ['steps/**/*.steps.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000
  }
});

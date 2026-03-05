import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.bdd',
    include: ['steps/**/*.steps.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Load .env.local from project root
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
      concurrent: false,
    },
    include: ['e2e/**/*.e2e.test.ts'],
  },
});

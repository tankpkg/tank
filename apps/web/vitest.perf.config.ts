import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: path.resolve(__dirname, '../..'),

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    include: ['tests/perf/**/*.perf.test.ts'],
    env: {
      TANK_PERF_MODE: '1',
    },
  },
});

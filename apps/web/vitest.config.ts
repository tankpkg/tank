import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
    exclude: ['tests/perf/**', 'node_modules/**'],
  },
});

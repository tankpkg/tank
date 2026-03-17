import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: path.resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.')
    }
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['.next/**', 'node_modules/**', 'tests/perf/**/*.perf.test.ts']
  }
});

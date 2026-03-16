<<<<<<<< HEAD:packages/cli/vitest.config.ts
========
import path from 'node:path';
>>>>>>>> main:packages/web/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
<<<<<<<< HEAD:packages/cli/vitest.config.ts
      '~/': new URL('./src/', import.meta.url).pathname
========
      '@': path.resolve(__dirname, '.')
>>>>>>>> main:packages/web/vitest.config.ts
    }
  },
  test: {
    environment: 'node',
<<<<<<<< HEAD:packages/cli/vitest.config.ts
    passWithNoTests: true
========
    passWithNoTests: true,
    exclude: ['tests/perf/**', 'node_modules/**', '.next/**']
>>>>>>>> main:packages/web/vitest.config.ts
  }
});

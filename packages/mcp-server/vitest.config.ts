import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '~/': new URL('./src/', import.meta.url).pathname
    }
  },
  test: {
<<<<<<<< HEAD:packages/mcp-server/vitest.config.ts
    environment: 'node',
    passWithNoTests: true
========
    environment: 'node'
>>>>>>>> main:packages/shared/vitest.config.ts
  }
});

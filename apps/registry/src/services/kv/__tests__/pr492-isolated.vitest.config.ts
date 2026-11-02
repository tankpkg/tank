import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const config = {
  envFile: false as const,
  resolve: { alias: { '~/': fileURLToPath(new URL('../../../', import.meta.url)) } },
  test: {
    environment: 'node' as const,
    env: { PR492_ISOLATED_CONFIG: '1' },
    include: ['src/services/kv/__tests__/pr492-*.test.ts'],
    fileParallelism: false,
    hookTimeout: 180_000
  }
};

export default defineConfig(config);

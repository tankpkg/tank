import { defineConfig } from 'tsdown';

export default defineConfig({
  platform: 'node',
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  deps: {
    alwaysBundle: ['@internals/schemas', '@internals/helpers', 'zod', 'semver']
  }
});

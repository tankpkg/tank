import { defineConfig } from 'tsdown';

export default defineConfig({
  platform: 'node',
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  sourcemap: true,
  clean: true
});

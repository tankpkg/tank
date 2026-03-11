import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  platform: 'neutral',
  format: 'esm',
  dts: true,
  clean: true,
  treeshake: {
    moduleSideEffects: false
  }
});

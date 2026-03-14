import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/bin/tank.ts', 'src/index.ts'],
  platform: 'node',
  format: 'esm',
  fixedExtension: false,
  dts: true,
  clean: true,
  copy: ['package.json'],
  deps: {
    alwaysBundle: [/^@tankpkg\//, /^@internals\//]
  }
});

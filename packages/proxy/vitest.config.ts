import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '~/': new URL('./src/', import.meta.url).pathname
    }
  },
  test: {
    environment: 'node',
    // Child-spawning tests contend on stdout/stdin handles when workers run
    // in parallel. Vitest 4 replaced poolOptions.forks.singleFork with
    // maxWorkers: 1 + isolate: false. Serialize spawn-heavy files until
    // they are hermetic (Phase 4+).
    maxWorkers: 1,
    isolate: false
  }
});

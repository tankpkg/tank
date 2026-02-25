import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

const envDir = path.resolve(__dirname, '../../..');
const envPath = path.join(envDir, '.env.local');

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const index = trimmed.indexOf('=');
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'steps/*.ts',
  outputDir: '.features-gen',
});

export default defineConfig({
  testDir,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [
    ['list'],
    cucumberReporter('html', { outputFile: 'e2e/bdd/reports/report.html' }),
  ],
  use: {
    // CLI-only tests
  },
});

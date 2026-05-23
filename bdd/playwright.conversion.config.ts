import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { cucumberReporter, defineBddConfig } from 'playwright-bdd';
import { getRegistryUrl } from '../e2e/targets.js';

const envDir = path.resolve(__dirname, '..');
const envPath = path.join(envDir, '.env');

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const testDir = defineBddConfig({
  features: 'features/browser/tanstack/**/conversion-*.feature',
  steps: 'steps/browser/{fixtures,conversion-skills,conversion-detail,search-ui,skill-detail,skills-browse-mobile}.steps.ts',
  importTestFrom: 'steps/browser/fixtures.ts',
  outputDir: '../test-results/bdd-browser-conversion/generated'
});

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  outputDir: '../test-results/bdd-browser-conversion/results',
  reporter: [['list'], cucumberReporter('html', { outputFile: '../test-results/bdd-browser-conversion/report.html' })],
  use: { testIdAttribute: 'data-testid' },
  projects: [
    {
      name: 'registry',
      testDir,
      use: { baseURL: getRegistryUrl() }
    }
  ]
});

import fs from 'node:fs';
import path from 'node:path';

import { resolve } from '@internals/helpers';
import chalk from 'chalk';

import { VERSION } from '~/version.js';

import { getConfigDir } from './config.js';

interface UpgradeCache {
  lastCheck: number;
  latestVersion: string;
}

function isNewerVersion(candidateVersion: string, currentVersion: string): boolean {
  if (candidateVersion === currentVersion) {
    return false;
  }

  return resolve('*', [candidateVersion, currentVersion]) === candidateVersion;
}

export async function checkForUpgrade(configDir?: string): Promise<void> {
  try {
    if (process.env.TANK_NO_UPDATE_CHECK || process.env.CI) {
      return;
    }

    const cacheDir = getConfigDir(configDir);
    const cachePath = path.join(cacheDir, 'upgrade_check.json');

    let cache: UpgradeCache | null = null;
    try {
      const raw = fs.readFileSync(cachePath, 'utf-8');
      cache = JSON.parse(raw) as UpgradeCache;
    } catch {
      // File doesn't exist or invalid JSON — treat as stale
    }

    const isFresh = cache !== null && Date.now() - cache.lastCheck < 24 * 60 * 60 * 1000;

    if (isFresh && cache !== null) {
      if (isNewerVersion(cache.latestVersion, VERSION)) {
        console.error(
          `\n  ${chalk.cyan('ℹ')} New version available: ${chalk.gray(VERSION)} → ${chalk.green(cache.latestVersion)}`
        );
        console.error(`  Run ${chalk.cyan('`tank upgrade`')} to update.\n`);
      }
      return;
    }

    const res = await fetch('https://api.github.com/repos/tankpkg/tank/releases/latest', {
      headers: { 'User-Agent': `tank-cli/${VERSION}` },
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as { tag_name: string };
    const latestVersion = data.tag_name.replace(/^v/, '');

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const newCache: UpgradeCache = { lastCheck: Date.now(), latestVersion };
    fs.writeFileSync(cachePath, `${JSON.stringify(newCache, null, 2)}\n`);

    if (isNewerVersion(latestVersion, VERSION)) {
      console.error(
        `\n  ${chalk.cyan('ℹ')} New version available: ${chalk.gray(VERSION)} → ${chalk.green(latestVersion)}`
      );
      console.error(`  Run ${chalk.cyan('`tank upgrade`')} to update.\n`);
    }
  } catch {
    // Silently swallow ALL errors — background check must never cause CLI to fail
  }
}

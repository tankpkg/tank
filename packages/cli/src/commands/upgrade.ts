import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolve } from '@internal/shared';
import chalk from 'chalk';
import { USER_AGENT, VERSION } from '../version.js';

export interface UpgradeOptions {
  version?: string;
  dryRun?: boolean;
  force?: boolean;
}

function isNewerVersion(candidateVersion: string, currentVersion: string): boolean {
  if (candidateVersion === currentVersion) {
    return false;
  }

  return resolve('*', [candidateVersion, currentVersion]) === candidateVersion;
}

function resolveCurrentBinary(): string {
  try {
    return fs.realpathSync(process.argv[1]);
  } catch {
    return process.execPath;
  }
}

export async function upgradeCommand(opts?: UpgradeOptions): Promise<void> {
  const currentBinaryPath = resolveCurrentBinary();
  if (
    process.platform !== 'win32' &&
    (currentBinaryPath.includes('/Cellar/') || currentBinaryPath.includes('/homebrew/'))
  ) {
    console.log(chalk.yellow('Tank was installed via Homebrew. Run `brew upgrade tank` instead.'));
    return;
  }

  if (
    currentBinaryPath.includes('node_modules') ||
    currentBinaryPath.endsWith('.js') ||
    currentBinaryPath.endsWith('.mjs')
  ) {
    console.log(chalk.yellow('Tank was installed via npm/npx. Run `npm update -g @tankpkg/cli` to upgrade instead.'));
    return;
  }

  let targetVersion: string;

  if (opts?.version) {
    targetVersion = opts.version;
  } else {
    const res = await fetch('https://api.github.com/repos/tankpkg/tank/releases/latest', {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch latest release: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { tag_name: string };
    targetVersion = data.tag_name.replace(/^v/, '');
  }

  if (!isNewerVersion(targetVersion, VERSION) && !opts?.force) {
    console.log(chalk.green(`✓ Already on latest version: ${VERSION}`));
    return;
  }

  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const binaryName = `tank-${platform}-${arch}${process.platform === 'win32' ? '.exe' : ''}`;

  if (opts?.dryRun) {
    console.log(`Would upgrade tank ${VERSION} → ${targetVersion}`);
    return;
  }

  console.log(chalk.cyan(`Upgrading tank ${VERSION} → ${targetVersion}...`));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-'));

  try {
    const binaryUrl = `https://github.com/tankpkg/tank/releases/download/v${targetVersion}/${binaryName}`;
    const tmpBin = path.join(tmpDir, binaryName);

    const binRes = await fetch(binaryUrl, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!binRes.ok) {
      throw new Error(`Failed to download binary: ${binRes.status} ${binRes.statusText}`);
    }
    if (!binRes.body) {
      throw new Error('Empty response body when downloading binary');
    }

    const binBuffer = Buffer.from(await binRes.arrayBuffer());
    fs.writeFileSync(tmpBin, binBuffer);

    const sumsUrl = `https://github.com/tankpkg/tank/releases/download/v${targetVersion}/SHA256SUMS`;
    const sumsRes = await fetch(sumsUrl, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!sumsRes.ok) {
      throw new Error(`Failed to download SHA256SUMS: ${sumsRes.status} ${sumsRes.statusText}`);
    }
    const sumsText = await sumsRes.text();

    let expectedHash: string | undefined;
    for (const line of sumsText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2 && parts[1] === binaryName) {
        expectedHash = parts[0];
        break;
      }
    }
    if (!expectedHash) {
      throw new Error(`No checksum found for ${binaryName} in SHA256SUMS`);
    }

    const fileBuffer = fs.readFileSync(tmpBin);
    const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    if (actualHash !== expectedHash) {
      console.log(chalk.red('Checksum mismatch. Aborting for security.'));
      return;
    }

    if (process.platform !== 'win32') {
      fs.chmodSync(tmpBin, 0o755);
    }

    fs.copyFileSync(tmpBin, currentBinaryPath);
    if (process.platform !== 'win32') {
      fs.chmodSync(currentBinaryPath, 0o755);
    }

    console.log(chalk.green(`✓ Upgraded tank ${VERSION} → ${targetVersion}`));
    console.log(chalk.gray(`Release notes: https://github.com/tankpkg/tank/releases/tag/v${targetVersion}`));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Real cross-filesystem regression for idd/modules/upgrade/INTENT.md (E7). */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

import { upgradeCommand } from '../../../packages/cli/src/commands/upgrade.js';
import { startUpgradePermissionProxy } from './upgrade-connect-proxy.js';

const downloadFilesystem = process.env.TANK_UPGRADE_CROSS_DEVICE_TMPDIR;
const builtBinary = process.env.TANK_UPGRADE_TEST_BINARY;
const execFileAsync = promisify(execFile);

function cliEnvironment(home: string, tmpdir: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    TMPDIR: tmpdir,
    PATH: process.env.PATH,
    NO_COLOR: '1',
    TANK_TELEMETRY: '0',
    TANK_NO_UPDATE_CHECK: '1',
    TANK_LOKI_URL: 'http://127.0.0.1:0'
  };
}

function binaryName(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `tank-${platform}-${arch}`;
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function releaseFile(version: string, name: string): Promise<Response> {
  const response = await fetch(`https://github.com/tankpkg/tank/releases/download/v${version}/${name}`, {
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`Could not download ${version}/${name}: ${response.status}`);
  return response;
}

async function releaseChecksum(version: string, name: string): Promise<string> {
  const sums = await (await releaseFile(version, 'SHA256SUMS')).text();
  const match = sums
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1] === name);
  if (!match || !/^[a-f0-9]{64}$/.test(match[0])) throw new Error(`No valid checksum for ${version}/${name}`);
  return match[0];
}

async function installReleasedBinary(version: string, binary: string): Promise<void> {
  const name = binaryName();
  const [response, expected] = await Promise.all([releaseFile(version, name), releaseChecksum(version, name)]);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== expected) throw new Error(`Checksum mismatch for ${version}/${name}`);
  fs.writeFileSync(binary, bytes, { mode: 0o755 });
  fs.chmodSync(binary, 0o755);
}

function proxyEnvironment(home: string, tmpdir: string, proxy: string): NodeJS.ProcessEnv {
  return { ...cliEnvironment(home, tmpdir), HTTPS_PROXY: proxy, https_proxy: proxy };
}

it.skipIf(!downloadFilesystem || process.platform === 'win32')(
  'recovers an older standalone binary after a real cross-filesystem EXDEV',
  async () => {
    if (!downloadFilesystem) throw new Error('TANK_UPGRADE_CROSS_DEVICE_TMPDIR is required');
    const installation = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-recovery-'));
    const binary = path.join(installation, 'tank');
    const home = path.join(installation, 'home');
    let foreignTmpdir: string | undefined;
    try {
      foreignTmpdir = fs.mkdtempSync(path.join(downloadFilesystem, 'tank-upgrade-foreign-'));
      expect(fs.statSync(installation).dev).not.toBe(fs.statSync(foreignTmpdir).dev);
      await installReleasedBinary('0.16.3', binary);
      fs.mkdirSync(path.join(home, '.tank'), { recursive: true });
      fs.writeFileSync(path.join(home, '.tank', 'config.json'), JSON.stringify({ telemetry: false }));
      const originalHash = sha256(fs.readFileSync(binary));
      const env = cliEnvironment(home, foreignTmpdir);
      expect((await execFileAsync(binary, ['--version'], { env, timeout: 10_000 })).stdout.trim()).toBe('0.16.3');

      const failure = await execFileAsync(binary, ['upgrade', '0.16.5'], { env, timeout: 120_000 }).then(
        () => null,
        (error: { stderr: string }) => error
      );
      expect(failure).not.toBeNull();
      expect(failure?.stderr).toContain('EXDEV');
      expect(sha256(fs.readFileSync(binary))).toBe(originalHash);
      expect(fs.readdirSync(foreignTmpdir)).toEqual([]);

      const recoveryEnv = cliEnvironment(home, installation);
      const recovery = await execFileAsync(binary, ['upgrade', '0.16.5'], { env: recoveryEnv, timeout: 120_000 });
      expect(recovery.stdout).toContain('Upgraded tank');
      const recoveredHash = await releaseChecksum('0.16.5', binaryName());
      expect(sha256(fs.readFileSync(binary))).toBe(recoveredHash);
      expect((await execFileAsync(binary, ['--version'], { env: recoveryEnv, timeout: 10_000 })).stdout.trim()).toBe(
        '0.16.5'
      );

      // The published recovery target predates the fix; it still needs the workaround.
      const repeatFailure = await execFileAsync(binary, ['upgrade', '0.16.5', '--force'], {
        env,
        timeout: 120_000
      }).then(
        () => null,
        (error: { stderr: string }) => error
      );
      expect(repeatFailure?.stderr).toContain('EXDEV');
      expect(sha256(fs.readFileSync(binary))).toBe(recoveredHash);
      expect(fs.readdirSync(foreignTmpdir)).toEqual([]);
    } finally {
      if (foreignTmpdir) fs.rmSync(foreignTmpdir, { recursive: true, force: true });
      fs.rmSync(installation, { recursive: true, force: true });
    }
  },
  420_000
);

it.skipIf(!downloadFilesystem || !builtBinary)(
  'replaces the running compiled CLI across real filesystems',
  async () => {
    if (!downloadFilesystem || !builtBinary) throw new Error('Cross-device test paths are required');
    const installation = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-running-'));
    const binary = path.join(installation, 'tank');
    const home = path.join(installation, 'home');
    try {
      expect(fs.statSync(installation).dev).not.toBe(fs.statSync(downloadFilesystem).dev);
      fs.copyFileSync(builtBinary, binary);
      fs.chmodSync(binary, 0o755);
      const oldHash = crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
      const oldInode = fs.statSync(binary).ino;
      fs.mkdirSync(path.join(home, '.tank'), { recursive: true });
      fs.writeFileSync(path.join(home, '.tank', 'config.json'), JSON.stringify({ telemetry: false }));
      const env = cliEnvironment(home, downloadFilesystem);
      const upgrade = await execFileAsync(binary, ['upgrade', '0.16.5', '--force'], { env, timeout: 120_000 });
      expect(upgrade.stdout).toContain('Upgraded tank');
      expect(crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex')).not.toBe(oldHash);
      expect(fs.statSync(binary).ino).not.toBe(oldInode);
      const version = await execFileAsync(binary, ['--version'], { env, timeout: 10_000 });
      expect(version.stdout.trim()).toBe('0.16.5');
    } finally {
      fs.rmSync(installation, { recursive: true, force: true });
    }
  },
  180_000
);

it.skipIf(!downloadFilesystem)(
  'upgrades a verified release across real filesystems',
  async () => {
    if (!downloadFilesystem) throw new Error('TANK_UPGRADE_CROSS_DEVICE_TMPDIR is required');
    const installation = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-install-'));
    const binary = path.join(installation, 'tank');
    const oldArgv = process.argv[1];
    const oldTmpdir = process.env.TMPDIR;
    const probe = fs.mkdtempSync(path.join(downloadFilesystem, 'tank-upgrade-probe-'));

    try {
      expect(fs.statSync(installation).dev).not.toBe(fs.statSync(probe).dev);
      fs.writeFileSync(binary, 'original executable');
      process.argv[1] = binary;
      process.env.TMPDIR = downloadFilesystem;

      await upgradeCommand({ version: '0.16.5', force: true });

      expect(fs.readFileSync(binary).toString()).not.toBe('original executable');
      expect(fs.statSync(binary).mode & 0o111).not.toBe(0);
    } finally {
      process.argv[1] = oldArgv;
      if (oldTmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = oldTmpdir;
      fs.rmSync(probe, { recursive: true, force: true });
      fs.rmSync(installation, { recursive: true, force: true });
    }
  },
  120_000
);

it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'preserves the executable and leaves no staging files when the install directory is read-only',
  async () => {
    const installation = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-readonly-'));
    const binary = path.join(installation, 'tank');
    const oldArgv = process.argv[1];
    fs.writeFileSync(binary, 'original executable');
    process.argv[1] = binary;
    fs.chmodSync(installation, 0o555);

    try {
      await expect(upgradeCommand({ version: '0.16.5', force: true })).rejects.toMatchObject({ code: 'EACCES' });
      expect(fs.readFileSync(binary, 'utf8')).toBe('original executable');
      expect(fs.readdirSync(installation)).toEqual(['tank']);
    } finally {
      process.argv[1] = oldArgv;
      fs.chmodSync(installation, 0o755);
      fs.rmSync(installation, { recursive: true, force: true });
    }
  }
);

it.skipIf(!downloadFilesystem || !builtBinary || process.platform === 'win32' || process.getuid?.() === 0)(
  'preserves the original error if permissions prevent cleanup after staging',
  async () => {
    if (!downloadFilesystem || !builtBinary) throw new Error('Cross-device test paths are required');
    const installation = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-cleanup-'));
    const binary = path.join(installation, 'tank');
    const home = path.join(installation, 'home');
    let proxy: Awaited<ReturnType<typeof startUpgradePermissionProxy>> | undefined;

    try {
      fs.copyFileSync(builtBinary, binary);
      fs.chmodSync(binary, 0o755);
      fs.mkdirSync(path.join(home, '.tank'), { recursive: true });
      fs.writeFileSync(path.join(home, '.tank', 'config.json'), JSON.stringify({ telemetry: false }));
      const originalHash = sha256(fs.readFileSync(binary));
      proxy = await startUpgradePermissionProxy(installation);
      const env = proxyEnvironment(home, downloadFilesystem, proxy.url);
      const failure = await execFileAsync(binary, ['upgrade', '999.999.999', '--force'], {
        env,
        timeout: 120_000
      }).then(
        () => null,
        (error: { stderr: string }) => error
      );
      expect(proxy.error()).toBeUndefined();
      expect(proxy.wasGated()).toBe(true);
      expect(failure).not.toBeNull();
      expect(failure?.stderr).toContain('Failed to download binary: 404');
      expect(failure?.stderr).toContain(
        `Could not remove temporary upgrade files at ${fs.realpathSync(installation)}/.tank-upgrade-`
      );
      expect(sha256(fs.readFileSync(binary))).toBe(originalHash);
      expect(fs.readdirSync(installation).some((name) => name.startsWith('.tank-upgrade-'))).toBe(true);
    } finally {
      if (proxy) await proxy.close();
      fs.chmodSync(installation, 0o755);
      fs.rmSync(installation, { recursive: true, force: true });
    }
  },
  120_000
);

it.skipIf(!downloadFilesystem || !builtBinary || process.platform === 'win32' || process.getuid?.() === 0)(
  'preserves the running executable when the final rename fails and reports the staging directory',
  async () => {
    if (!downloadFilesystem || !builtBinary) throw new Error('Cross-device test paths are required');
    const installation = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-rename-'));
    const binary = path.join(installation, 'tank');
    const home = path.join(installation, 'home');
    let proxy: Awaited<ReturnType<typeof startUpgradePermissionProxy>> | undefined;

    try {
      fs.copyFileSync(builtBinary, binary);
      fs.chmodSync(binary, 0o755);
      fs.mkdirSync(path.join(home, '.tank'), { recursive: true });
      fs.writeFileSync(path.join(home, '.tank', 'config.json'), JSON.stringify({ telemetry: false }));
      const originalHash = sha256(fs.readFileSync(binary));
      proxy = await startUpgradePermissionProxy(installation);
      const env = proxyEnvironment(home, downloadFilesystem, proxy.url);
      const failure = await execFileAsync(binary, ['upgrade', '0.16.5', '--force'], { env, timeout: 180_000 }).then(
        () => null,
        (error: { stderr: string }) => error
      );
      expect(proxy.error()).toBeUndefined();
      expect(proxy.wasGated()).toBe(true);
      expect(failure).not.toBeNull();
      expect(failure?.stderr).toContain('Upgrade failed: EACCES');
      expect(failure?.stderr).toContain('rename');
      expect(failure?.stderr).toContain(
        `Could not remove temporary upgrade files at ${fs.realpathSync(installation)}/.tank-upgrade-`
      );
      expect(sha256(fs.readFileSync(binary))).toBe(originalHash);
    } finally {
      if (proxy) await proxy.close();
      fs.chmodSync(installation, 0o755);
      fs.rmSync(installation, { recursive: true, force: true });
    }
  },
  200_000
);

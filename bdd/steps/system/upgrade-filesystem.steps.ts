/** Real cross-filesystem regression for idd/modules/upgrade/INTENT.md (E7). */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

import { upgradeCommand } from '../../../packages/cli/src/commands/upgrade.js';

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

it.skipIf(!downloadFilesystem || process.platform === 'win32' || process.getuid?.() === 0)(
  'preserves the original error if permissions prevent cleanup after staging',
  async () => {
    const installation = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-cleanup-'));
    const binary = path.join(installation, 'tank');
    const oldArgv = process.argv[1];
    fs.writeFileSync(binary, 'original executable');
    process.argv[1] = binary;
    const watcher = fs.watch(installation, (_event, name) => {
      if (name?.toString().startsWith('.tank-upgrade-')) fs.chmodSync(installation, 0o555);
    });

    try {
      await expect(upgradeCommand({ version: '999.999.999', force: true })).rejects.toThrow(
        'Failed to download binary: 404'
      );
      expect(fs.readFileSync(binary, 'utf8')).toBe('original executable');
      expect(fs.readdirSync(installation).some((name) => name.startsWith('.tank-upgrade-'))).toBe(true);
    } finally {
      watcher.close();
      process.argv[1] = oldArgv;
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
    fs.copyFileSync(builtBinary, binary);
    fs.chmodSync(binary, 0o755);
    fs.mkdirSync(path.join(home, '.tank'), { recursive: true });
    fs.writeFileSync(path.join(home, '.tank', 'config.json'), JSON.stringify({ telemetry: false }));
    const originalHash = crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
    let madeReadOnly = false;
    const watcher = fs.watch(installation, (_event, name) => {
      if (name?.toString().startsWith('.tank-upgrade-')) {
        fs.chmodSync(installation, 0o555);
        madeReadOnly = true;
      }
    });

    try {
      const env = cliEnvironment(home, downloadFilesystem);
      const failure = await execFileAsync(binary, ['upgrade', '0.16.5', '--force'], { env, timeout: 180_000 }).then(
        () => null,
        (error: { stderr: string }) => error
      );
      expect(madeReadOnly).toBe(true);
      expect(failure).not.toBeNull();
      expect(failure?.stderr).toContain('Upgrade failed: EACCES');
      expect(failure?.stderr).toContain('rename');
      expect(failure?.stderr).toContain(
        `Could not remove temporary upgrade files at ${fs.realpathSync(installation)}/.tank-upgrade-`
      );
      expect(crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex')).toBe(originalHash);
    } finally {
      watcher.close();
      fs.chmodSync(installation, 0o755);
      fs.rmSync(installation, { recursive: true, force: true });
    }
  },
  200_000
);

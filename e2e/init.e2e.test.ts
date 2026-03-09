/**
 * Init E2E Tests — `tank init` non-interactive skill creation.
 * ZERO mocks: real CLI binary, real filesystem.
 *
 * Uses --yes flag for non-interactive mode (no TTY required).
 *
 * Prerequisites:
 * - CLI built: bun run build --filter=@tankpkg/cli
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { expectSuccess, runTank } from './helpers/cli';
import { cleanupFixture } from './helpers/fixtures';

describe('Init E2E — tank init creates tank.json', () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      cleanupFixture(dir);
    }
  });

  function createTempDir(prefix: string): { dir: string; home: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);

    const home = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}home-`));
    const tankDir = path.join(home, '.tank');
    fs.mkdirSync(tankDir, { recursive: true });
    fs.writeFileSync(path.join(tankDir, 'config.json'), `${JSON.stringify({}, null, 2)}\n`);
    tempDirs.push(home);

    return { dir, home };
  }

  // -----------------------------------------------------------------------
  // 1. init --yes creates tank.json with explicit values
  // -----------------------------------------------------------------------
  it('init --yes creates tank.json with explicit values', async () => {
    const { dir, home } = createTempDir('tank-init-');

    const result = await runTank(
      ['init', '--yes', '--name', '@test/my-skill', '--skill-version', '1.0.0', '--description', 'A test skill'],
      { cwd: dir, home, timeoutMs: 15_000 }
    );

    expectSuccess(result);

    const skillsPath = path.join(dir, 'tank.json');
    expect(fs.existsSync(skillsPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(skillsPath, 'utf-8'));
    expect(manifest.name).toBe('@test/my-skill');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.description).toBe('A test skill');
    expect(manifest.visibility).toBe('public');
    expect(manifest.skills).toEqual({});
    expect(manifest.permissions).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 2. init --yes with only name uses default version
  // -----------------------------------------------------------------------
  it('init --yes with only name uses default version', async () => {
    const { dir, home } = createTempDir('tank-init-defaults-');

    const result = await runTank(['init', '--yes', '--name', '@test/default-skill'], {
      cwd: dir,
      home,
      timeoutMs: 15_000
    });

    expectSuccess(result);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, 'tank.json'), 'utf-8'),
    );
    expect(manifest.name).toBe('@test/default-skill');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.visibility).toBe('public');
    expect(manifest).not.toHaveProperty('description');
  });

  // -----------------------------------------------------------------------
  // 3. init --yes errors when tank.json exists without --force
  // -----------------------------------------------------------------------
  it('init --yes errors when tank.json exists without --force', async () => {
    const { dir, home } = createTempDir('tank-init-exists-');

    const originalManifest = { name: '@test/original', version: '0.0.1' };
    const skillsPath = path.join(dir, 'tank.json');
    fs.writeFileSync(skillsPath, JSON.stringify(originalManifest, null, 2) + '\n');

    const result = await runTank(['init', '--yes', '--name', '@test/new-name'], { cwd: dir, home, timeoutMs: 15_000 });

    const afterManifest = JSON.parse(fs.readFileSync(skillsPath, 'utf-8'));
    expect(afterManifest.name).toBe('@test/original');
    expect(afterManifest.version).toBe('0.0.1');

    const output = result.stdout + result.stderr;
    expect(output).toMatch(/already exists|force/i);
  });

  // -----------------------------------------------------------------------
  // 4. init --yes --force overwrites existing tank.json
  // -----------------------------------------------------------------------
  it('init --yes --force overwrites existing tank.json', async () => {
    const { dir, home } = createTempDir('tank-init-overwrite-');

    const originalManifest = { name: '@test/old-name', version: '0.0.1' };
    const skillsPath = path.join(dir, 'tank.json');
    fs.writeFileSync(skillsPath, JSON.stringify(originalManifest, null, 2) + '\n');

    const result = await runTank(
      [
        'init',
        '--yes',
        '--force',
        '--name',
        '@test/new-name',
        '--skill-version',
        '2.0.0',
        '--description',
        'New description'
      ],
      { cwd: dir, home, timeoutMs: 15_000 }
    );

    expectSuccess(result);

    const manifest = JSON.parse(fs.readFileSync(skillsPath, 'utf-8'));
    expect(manifest.name).toBe('@test/new-name');
    expect(manifest.version).toBe('2.0.0');
    expect(manifest.description).toBe('New description');
    expect(manifest.visibility).toBe('public');
  });

  // -----------------------------------------------------------------------
  // 5. init --yes --private sets visibility to private
  // -----------------------------------------------------------------------
  it('init --yes --private sets visibility to private', async () => {
    const { dir, home } = createTempDir('tank-init-private-');

    const result = await runTank(['init', '--yes', '--name', '@test/private-skill', '--private'], {
      cwd: dir,
      home,
      timeoutMs: 15_000
    });

    expectSuccess(result);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, 'tank.json'), 'utf-8'),
    );
    expect(manifest.visibility).toBe('private');
  });

  // -----------------------------------------------------------------------
  // 6. init --yes rejects invalid name
  // -----------------------------------------------------------------------
  it('init --yes rejects invalid name', async () => {
    const { dir, home } = createTempDir('tank-init-badname-');

    const result = await runTank(['init', '--yes', '--name', 'UPPERCASE-NAME'], { cwd: dir, home, timeoutMs: 15_000 });

    expect(fs.existsSync(path.join(dir, 'tank.json'))).toBe(false);

    const output = result.stdout + result.stderr;
    expect(output).toMatch(/lowercase|alphanumeric|invalid/i);
  });
});

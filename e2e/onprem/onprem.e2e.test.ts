import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runTank } from '../helpers/cli';
import { getRegistryUrl } from '../targets.js';

const registry = getRegistryUrl();

async function createSkillFixture(dir: string, name: string): Promise<string> {
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });

  await writeFile(
    join(skillDir, 'tank.json'),
    `${JSON.stringify(
      {
        name: `@onprem/${name}`,
        version: '1.0.0',
        description: 'Test skill for on-prem E2E',
        skills: {}
      },
      null,
      2
    )}\n`
  );

  await writeFile(join(skillDir, 'SKILL.md'), `# ${name}\n\nTest skill for E2E testing.`);
  await writeFile(join(skillDir, 'README.md'), `# ${name}\n\nTest skill for E2E testing.`);

  return skillDir;
}

describe('On-Prem E2E: Health Checks', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'tank-onprem-e2e-'));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reports version correctly', async () => {
    const result = await runTank(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it('shows help with all on-prem commands', async () => {
    const result = await runTank(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('login');
    expect(result.stdout).toContain('publish');
    expect(result.stdout).toContain('whoami');
  });
});

describe('On-Prem E2E: CLI Auth with Redis', () => {
  let tmpDir: string;
  let _apiKey: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'tank-onprem-redis-'));
    process.env.TANK_CONFIG_DIR = tmpDir;
  });

  afterAll(async () => {
    delete process.env.TANK_CONFIG_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('stores API key after login', async () => {
    if (!process.env.E2E_API_KEY) {
      return;
    }

    const result = await runTank(['login', '--api-key', process.env.E2E_API_KEY]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Logged in');

    const whoami = await runTank(['whoami']);
    expect(whoami.exitCode).toBe(0);
  }, 30000);
});

describe('On-Prem E2E: Storage Backend', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'tank-onprem-storage-'));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('validates skill package structure', async () => {
    const skillDir = await createSkillFixture(tmpDir, 'test-skill');
    const home = await mkdtemp(join(tmpdir(), 'tank-onprem-dryrun-'));
    await mkdir(join(home, '.tank'), { recursive: true });
    await writeFile(
      join(home, '.tank', 'config.json'),
      `${JSON.stringify({ registry, token: 'tank_dummy_token' }, null, 2)}\n`
    );

    const result = await runTank(['publish', '--dry-run'], { cwd: skillDir, home });
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/dry.run/i);

    await rm(home, { recursive: true, force: true });
  }, 60000);
});

describe('On-Prem E2E: Error Handling', () => {
  it('reports clear error for missing API key', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'tank-onprem-error-'));
    const skillDir = await createSkillFixture(tmpDir, 'error-skill');

    const result = await runTank(['publish'], {
      cwd: skillDir,
      env: { TANK_CONFIG_DIR: tmpDir }
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not logged in|no api key|login required/i);

    await rm(tmpDir, { recursive: true, force: true });
  }, 60000);

  it('reports clear error for invalid skill', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'tank-onprem-invalid-'));
    const skillDir = join(tmpDir, 'invalid-skill');
    await mkdir(skillDir, { recursive: true });

    await writeFile(join(skillDir, 'tank.json'), JSON.stringify({ name: 'invalid' }));

    const home = await mkdtemp(join(tmpdir(), 'tank-onprem-invalid-home-'));
    await mkdir(join(home, '.tank'), { recursive: true });
    await writeFile(
      join(home, '.tank', 'config.json'),
      `${JSON.stringify({ registry, token: 'tank_dummy_token' }, null, 2)}\n`
    );

    const result = await runTank(['publish', '--dry-run'], { cwd: skillDir, home });
    expect(result.exitCode).toBe(1);

    await rm(home, { recursive: true, force: true });
    await rm(tmpDir, { recursive: true, force: true });
  }, 60000);
});

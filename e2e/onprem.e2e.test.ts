import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TANK_CLI = join(process.cwd(), 'packages/cli/bin/tank.ts');
const _NO_COLOR = 'NO_COLOR=1';

async function runTank(
  args: string[],
  options?: { env?: Record<string, string> }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const env = { ...process.env, ...options?.env, NO_COLOR: '1' };
    const proc = spawn('npx', ['tsx', TANK_CLI, ...args], {
      cwd: process.cwd(),
      env,
      shell: true
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data;
    });
    proc.stderr.on('data', (data) => {
      stderr += data;
    });
    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

async function createSkillFixture(dir: string, name: string): Promise<string> {
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });

  await writeFile(
    join(skillDir, 'skills.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        description: 'Test skill for on-prem E2E',
        skills: [{ name: 'test', description: 'Test skill' }]
      },
      null,
      2
    )
  );

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

    const result = await runTank(['validate', skillDir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('valid');
  }, 60000);
});

describe('On-Prem E2E: Error Handling', () => {
  it('reports clear error for missing API key', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'tank-onprem-error-'));
    const skillDir = await createSkillFixture(tmpDir, 'error-skill');

    const result = await runTank(['publish', skillDir], {
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

    await writeFile(join(skillDir, 'skills.json'), JSON.stringify({ name: 'invalid' }));

    const result = await runTank(['validate', skillDir]);
    expect(result.exitCode).toBe(1);

    await rm(tmpDir, { recursive: true, force: true });
  }, 60000);
});

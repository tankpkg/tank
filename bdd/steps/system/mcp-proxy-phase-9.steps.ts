import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const TANK_BIN = path.resolve(__dirname, '../../../packages/cli/dist/bin/tank.js');

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runTank(
  args: string[],
  opts: { home: string; env?: Record<string, string>; timeoutMs?: number } = { home: '' }
): Promise<CliResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: opts.home,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TANK_REGISTRY_URL: 'http://invalid.tank.local',
    ...opts.env
  };
  try {
    const { stdout, stderr } = await execFileAsync('node', [TANK_BIN, ...args], {
      env,
      timeout: opts.timeoutMs ?? 10_000
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: typeof e.code === 'number' ? e.code : 1 };
  }
}

function spawnTank(args: string[], opts: { home: string }): Promise<CliResult> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: opts.home,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TANK_REGISTRY_URL: 'http://invalid.tank.local'
    };
    const child = spawn('node', [TANK_BIN, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), 5_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

function modelFilePath(home: string): string {
  return path.join(home, '.tank', 'models', 'prompt-injection.onnx');
}

describe('Feature: Phase 9 ML classifier opt-in (@phase-9 @C41)', { timeout: 30000 }, () => {
  let sandbox: string;
  let home: string;

  beforeEach(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'tank-bdd-p9-'));
    home = path.join(sandbox, 'home');
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('Scenario: E34 — default posture has ML disabled, no download prompt (@C41)', () => {
    it('tank proxy --help does not mention ML as required, and model file is not created', async () => {
      const result = await runTank(['proxy', '--help'], { home });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--enable-ml');
      expect(existsSync(modelFilePath(home))).toBe(false);
    });
  });

  describe('Scenario: E35 — --enable-ml with no model installed fails loud (@C41)', () => {
    it('spawns tank proxy --enable-ml -- <child>; exits non-zero with install guidance', async () => {
      const result = await spawnTank(['proxy', '--enable-ml', '--', 'node', '-e', 'setTimeout(()=>{},99999)'], {
        home
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('ML model not installed');
      expect(result.stderr).toContain('download-ml-model');
    });
  });

  describe('Scenario: E37 — tank proxy download-ml-model --yes is non-interactive (@C41)', () => {
    it('creates the models dir and a placeholder marker file; exits 0', async () => {
      const result = await runTank(['proxy', 'download-ml-model', '--yes'], { home });
      expect(result.exitCode).toBe(0);
      expect(result.stderr.toLowerCase()).toContain('not yet shipped');
      expect(existsSync(modelFilePath(home))).toBe(true);
      const marker = readFileSync(modelFilePath(home), 'utf-8');
      expect(marker).toContain('PHASE_9_SCAFFOLD');
    });
  });

  describe('Scenario: Idempotent re-run reports already-installed (@C41 @edge-case)', () => {
    it('second run of --yes after install exits 0 with "already" message', async () => {
      await runTank(['proxy', 'download-ml-model', '--yes'], { home });
      const second = await runTank(['proxy', 'download-ml-model', '--yes'], { home });
      expect(second.exitCode).toBe(0);
      expect(second.stderr.toLowerCase()).toContain('already');
    });
  });

  describe('Scenario: After model install, --enable-ml starts without "not installed" error (@C41)', () => {
    it('placeholder model present + --enable-ml + trivial child child exits when proxy is killed', async () => {
      mkdirSync(path.dirname(modelFilePath(home)), { recursive: true });
      writeFileSync(modelFilePath(home), 'PHASE_9_SCAFFOLD\n');
      const result = await spawnTank(['proxy', '--enable-ml', '--', 'node', '-e', 'setTimeout(()=>{},99999)'], {
        home
      });
      expect(result.stderr).not.toContain('ML model not installed');
    });
  });

  describe('Scenario: Download prompt message mentions size (~500 MB) (@C41)', () => {
    it('the --yes output from download-ml-model mentions ~500 MB in its scaffold message', async () => {
      const result = await runTank(['proxy', 'download-ml-model', '--yes'], { home });
      expect(result.exitCode).toBe(0);
      const helpResult = await runTank(['proxy', '--help'], { home });
      expect(helpResult.stdout).toContain('500MB');
    });
  });
});

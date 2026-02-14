/**
 * CLI helper — spawns the tank binary as a child process.
 * ZERO mocks: real binary, real HTTP to the live server.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

/** Path to the compiled CLI binary */
const TANK_BIN = path.resolve(__dirname, '../../apps/cli/dist/bin/tank.js');

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawn `tank <args>` as a child process.
 *
 * @param args  CLI arguments (e.g., ['publish', '--dry-run'])
 * @param opts  cwd: working directory, home: override HOME for config isolation
 */
export async function runTank(
  args: string[],
  opts: {
    cwd?: string;
    home?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<CliResult> {
  const env = {
    ...process.env,
    // Override HOME so CLI reads/writes to isolated temp config
    ...(opts.home ? { HOME: opts.home } : {}),
    // Disable colors for easier assertion matching
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    ...opts.env,
  };

  try {
    const { stdout, stderr } = await execFileAsync('node', [TANK_BIN, ...args], {
      cwd: opts.cwd,
      env,
      timeout: opts.timeoutMs ?? 30_000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
    };

    // If the process was killed due to timeout, return a special exit code
    if (e.killed) {
      return {
        stdout: e.stdout ?? '',
        stderr: (e.stderr ?? '') + '\n[TIMEOUT]',
        exitCode: 124,
      };
    }

    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

/**
 * Assert helper — verify the CLI exited cleanly with expected output.
 */
export function expectSuccess(result: CliResult, pattern?: string | RegExp): void {
  if (result.exitCode !== 0) {
    throw new Error(
      `Expected exit code 0, got ${result.exitCode}.\n` +
      `stdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
  if (pattern) {
    const text = result.stdout + result.stderr;
    const matches = typeof pattern === 'string'
      ? text.toLowerCase().includes(pattern.toLowerCase())
      : pattern.test(text);
    if (!matches) {
      throw new Error(
        `Expected output to match ${pattern}, but got:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
    }
  }
}

/**
 * Assert helper — verify the CLI failed with expected error output.
 */
export function expectFailure(result: CliResult, pattern?: string | RegExp): void {
  if (result.exitCode === 0) {
    throw new Error(
      `Expected non-zero exit code, got 0.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
  if (pattern) {
    const text = result.stdout + result.stderr;
    const matches = typeof pattern === 'string'
      ? text.toLowerCase().includes(pattern.toLowerCase())
      : pattern.test(text);
    if (!matches) {
      throw new Error(
        `Expected error output to match ${pattern}, but got:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
    }
  }
}

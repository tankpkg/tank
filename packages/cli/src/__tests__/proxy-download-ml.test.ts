import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyDownloadMlCommand } from '~/commands/proxy-download-ml.js';

let sandbox: string;
let modelsDir: string;

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'tank-cli-download-ml-'));
  modelsDir = path.join(sandbox, 'models');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('proxyDownloadMlCommand (C41) — non-interactive path', () => {
  it('with --yes, exits 0 and writes a placeholder marker', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await proxyDownloadMlCommand({
      yes: true,
      modelsDir,
      exit: false
    });
    expect(result.exitCode).toBe(0);
    const msg = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(msg.toLowerCase()).toContain('not yet shipped');
    expect(existsSync(path.join(modelsDir, 'prompt-injection.onnx'))).toBe(true);
    stderr.mockRestore();
  });

  it('with already-installed, reports idempotency and exits 0', async () => {
    await proxyDownloadMlCommand({ yes: true, modelsDir, exit: false });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await proxyDownloadMlCommand({ yes: true, modelsDir, exit: false });
    expect(result.exitCode).toBe(0);
    const msg = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(msg.toLowerCase()).toContain('already');
    stderr.mockRestore();
  });
});

describe('proxyDownloadMlCommand (C41) — consent prompt path', () => {
  it('prompts when yes is not set, exits 1 on decline', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await proxyDownloadMlCommand({
      yes: false,
      modelsDir,
      exit: false,
      confirm: async () => false
    });
    expect(result.exitCode).toBe(1);
    const msg = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(msg.toLowerCase()).toContain('declined');
    expect(existsSync(path.join(modelsDir, 'prompt-injection.onnx'))).toBe(false);
    stderr.mockRestore();
  });

  it('proceeds when consent granted, exits 0', async () => {
    const result = await proxyDownloadMlCommand({
      yes: false,
      modelsDir,
      exit: false,
      confirm: async () => true
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(modelsDir, 'prompt-injection.onnx'))).toBe(true);
  });

  it('passes a size-annotated prompt (~500 MB) to confirm', async () => {
    let prompt = '';
    await proxyDownloadMlCommand({
      yes: false,
      modelsDir,
      exit: false,
      confirm: async (msg) => {
        prompt = msg;
        return false;
      }
    });
    expect(prompt).toContain('500');
    expect(prompt.toLowerCase()).toContain('mb');
  });
});

describe('proxyDownloadMlCommand — never logs secrets or arbitrary stdout noise', () => {
  it('writes user-facing messages only to stderr, keeping stdout free for JSON-RPC piping', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await proxyDownloadMlCommand({ yes: true, modelsDir, exit: false });
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
    stdout.mockRestore();
    stderr.mockRestore();
  });
});

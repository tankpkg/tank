import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startProxy } from '../proxy.ts';

describe('startProxy — command allowlist (realpath guard)', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'tank-proxy-cmdallow-'));
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('rejects an absolute command path outside PATH + ~/.tank + $PWD/node_modules/.bin', async () => {
    const evilBin = join(sandbox, 'evil-bin');
    writeFileSync(evilBin, '#!/bin/sh\necho hi\n', { mode: 0o755 });

    await expect(
      startProxy({
        command: evilBin,
        args: [],
        auditPath: join(sandbox, 'audit.jsonl')
      })
    ).rejects.toThrow(/command path not allowed/i);
  });

  it('rejects a symlink whose realpath escapes the declared allowlist', async () => {
    const evilTarget = join(sandbox, 'evil-target');
    writeFileSync(evilTarget, '#!/bin/sh\necho hi\n', { mode: 0o755 });

    const trojanDir = join(sandbox, 'fake-allow');
    mkdirSync(trojanDir, { recursive: true });
    const trojanLink = join(trojanDir, 'trojan');
    symlinkSync(evilTarget, trojanLink);

    await expect(
      startProxy({
        command: trojanLink,
        args: [],
        auditPath: join(sandbox, 'audit.jsonl'),
        allowlist: [`${trojanDir}/**`]
      })
    ).rejects.toThrow(/command path not allowed/i);
  });

  it('accepts a bare command name that resolves via PATH', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const handle = await startProxy({
      command: 'node',
      args: ['-e', '0'],
      auditPath: join(sandbox, 'audit.jsonl'),
      stdin,
      stdout
    });
    const code = await handle.exitCode;
    expect(code).toBe(0);
    stdin.end();
    stdout.destroy();
  });
});

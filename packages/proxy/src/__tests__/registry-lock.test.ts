import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tryAcquireLock, withRegistryLock } from '~/scanner/registry-lock.js';

let dir: string;
let target: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'tank-reg-lock-'));
  target = path.join(dir, 'registry.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('tryAcquireLock — atomic lock acquisition via O_EXCL', () => {
  it('acquires on first call, returns a release function', () => {
    const lock = tryAcquireLock(target);
    expect(lock).not.toBeNull();
    expect(existsSync(`${target}.lock`)).toBe(true);
    lock?.release();
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it('second acquisition while first holder is live returns null', () => {
    const first = tryAcquireLock(target);
    expect(first).not.toBeNull();
    const second = tryAcquireLock(target);
    expect(second).toBeNull();
    first?.release();
  });

  it('writes the current PID into the lock file', () => {
    const lock = tryAcquireLock(target);
    const raw = readFileSync(`${target}.lock`, 'utf-8');
    expect(Number(raw.trim())).toBe(process.pid);
    lock?.release();
  });

  it('reclaims a lock whose PID is dead (stale lock)', () => {
    writeFileSync(`${target}.lock`, '99999\n');
    const lock = tryAcquireLock(target);
    expect(lock).not.toBeNull();
    const raw = readFileSync(`${target}.lock`, 'utf-8');
    expect(Number(raw.trim())).toBe(process.pid);
    lock?.release();
  });

  it('does NOT reclaim a lock whose PID is a live process (this process)', () => {
    writeFileSync(`${target}.lock`, `${process.pid}\n`);
    const lock = tryAcquireLock(target);
    expect(lock).toBeNull();
    rmSync(`${target}.lock`);
  });

  it('handles malformed lock-file contents by treating lock as stale', () => {
    writeFileSync(`${target}.lock`, 'not-a-pid\n');
    const lock = tryAcquireLock(target);
    expect(lock).not.toBeNull();
    lock?.release();
  });

  it('release() is idempotent', () => {
    const lock = tryAcquireLock(target);
    lock?.release();
    expect(() => lock?.release()).not.toThrow();
  });
});

describe('withRegistryLock — wait-with-backoff, then run block, then release', () => {
  it('runs the block exclusively and releases on success', async () => {
    let ran = false;
    await withRegistryLock(target, async () => {
      ran = true;
      expect(existsSync(`${target}.lock`)).toBe(true);
    });
    expect(ran).toBe(true);
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it('releases the lock even when the block throws', async () => {
    await expect(
      withRegistryLock(target, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it('two concurrent withRegistryLock calls serialize in this process', async () => {
    const order: string[] = [];
    const a = withRegistryLock(target, async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 50));
      order.push('a-end');
    });
    const b = withRegistryLock(target, async () => {
      order.push('b-start');
      order.push('b-end');
    });
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('waits for a cross-process lock to be released (stale detection)', async () => {
    writeFileSync(`${target}.lock`, '99999\n');
    let ran = false;
    await withRegistryLock(target, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it('gives up with a clear error after maxWaitMs if lock holder is alive', async () => {
    writeFileSync(`${target}.lock`, `${process.pid}\n`);
    await expect(withRegistryLock(target, async () => {}, { maxWaitMs: 100 })).rejects.toThrow(/timed out/i);
    rmSync(`${target}.lock`);
  });
});

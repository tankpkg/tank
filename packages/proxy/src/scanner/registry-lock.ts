import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

const LOCK_SUFFIX = '.lock';
const DEFAULT_MAX_WAIT_MS = 5_000;
const POLL_INITIAL_MS = 5;
const POLL_MAX_MS = 100;

export interface AcquiredLock {
  release(): void;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

function readLockPid(lockPath: string): number | null {
  try {
    const raw = readFileSync(lockPath, 'utf-8');
    const pid = Number(raw.trim());
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return pid;
  } catch {
    return null;
  }
}

function tryCreateLock(lockPath: string): AcquiredLock | null {
  try {
    const fd = openSync(lockPath, 'wx');
    writeSync(fd, `${process.pid}\n`);
    closeSync(fd);
    let released = false;
    return {
      release(): void {
        if (released) return;
        released = true;
        try {
          unlinkSync(lockPath);
        } catch {
          return;
        }
      }
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    return null;
  }
}

export function tryAcquireLock(target: string): AcquiredLock | null {
  const lockPath = `${target}${LOCK_SUFFIX}`;
  const parentDir = dirname(target);
  if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });

  const direct = tryCreateLock(lockPath);
  if (direct !== null) return direct;

  const existingPid = readLockPid(lockPath);
  if (existingPid === null || !isProcessAlive(existingPid)) {
    try {
      unlinkSync(lockPath);
    } catch {
      return null;
    }
    return tryCreateLock(lockPath);
  }
  return null;
}

export interface LockOptions {
  maxWaitMs?: number;
}

export async function withRegistryLock<T>(
  target: string,
  block: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const deadline = Date.now() + (options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS);
  let delay = POLL_INITIAL_MS;
  while (true) {
    const acquired = tryAcquireLock(target);
    if (acquired !== null) {
      try {
        return await block();
      } finally {
        acquired.release();
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(`withRegistryLock: timed out waiting for lock on ${target}`);
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, POLL_MAX_MS);
  }
}

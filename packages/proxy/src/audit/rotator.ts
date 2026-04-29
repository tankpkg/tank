import { existsSync, renameSync, rmSync, statSync } from 'node:fs';

export const ROTATION_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const MAX_RING_SIZE = 5;

function ringPath(basePath: string, index: number): string {
  return `${basePath}.${index}`;
}

function shouldRotate(logPath: string): boolean {
  if (!existsSync(logPath)) return false;
  return statSync(logPath).size > ROTATION_THRESHOLD_BYTES;
}

function shiftRing(basePath: string): void {
  const oldest = ringPath(basePath, MAX_RING_SIZE);
  if (existsSync(oldest)) rmSync(oldest, { force: true });
  for (let i = MAX_RING_SIZE - 1; i >= 1; i--) {
    const src = ringPath(basePath, i);
    if (existsSync(src)) renameSync(src, ringPath(basePath, i + 1));
  }
}

export function rotateIfNeeded(logPath: string): void {
  if (!shouldRotate(logPath)) return;
  shiftRing(logPath);
  renameSync(logPath, ringPath(logPath, 1));
}

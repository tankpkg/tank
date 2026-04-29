import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PinFile {
  packageHash: string;
  pinnedAt: string;
  tools: Record<string, string>;
}

export class PinReadError extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'PinReadError';
  }
}

const STALE_TEMP_THRESHOLD_MS = 60 * 60 * 1000;
const TEMP_SUFFIX_PATTERN = /\.tmp\.\d+\.[0-9a-f]+$/;

function ensureDirectory(dir: string): void {
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function buildTempPath(target: string): string {
  const random = randomBytes(4).toString('hex');
  return `${target}.tmp.${process.pid}.${random}`;
}

export function writePinFile(target: string, pin: PinFile): void {
  ensureDirectory(path.dirname(target));
  const temp = buildTempPath(target);
  const payload = JSON.stringify(pin);
  try {
    fs.writeFileSync(temp, payload, { encoding: 'utf8' });
    fs.renameSync(temp, target);
  } catch (err) {
    fs.rmSync(temp, { force: true });
    throw err;
  }
}

function isPinFileShape(value: unknown): value is PinFile {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.packageHash === 'string' &&
    typeof candidate.pinnedAt === 'string' &&
    typeof candidate.tools === 'object' &&
    candidate.tools !== null
  );
}

export function readPinFile(target: string): PinFile | null {
  let raw: string;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw new PinReadError(`Pin read failed: ${(err as Error).message}`, err);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new PinReadError('Pin file is not valid JSON', err);
  }
  if (!isPinFileShape(parsed)) {
    throw new PinReadError('Pin file does not match PinFile shape');
  }
  return parsed;
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

export function sweepStaleTemps(pinsDir: string): void {
  if (!fs.existsSync(pinsDir)) return;
  const entries = fs.readdirSync(pinsDir);
  const now = Date.now();
  for (const name of entries) {
    if (!TEMP_SUFFIX_PATTERN.test(name)) continue;
    const full = path.join(pinsDir, name);
    const stats = fs.statSync(full);
    if (now - stats.mtimeMs > STALE_TEMP_THRESHOLD_MS) {
      fs.rmSync(full, { force: true });
    }
  }
}

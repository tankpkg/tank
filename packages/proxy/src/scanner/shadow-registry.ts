import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface RegistryEntry {
  server: string;
  tool_name: string;
  description: string;
  schema_hash: string;
  last_observed: string;
}

export const TTL_MS = 30 * 24 * 60 * 60 * 1000;

let writeChain: Promise<void> = Promise.resolve();

function ensureDirFor(file: string): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function doAppend(file: string, entry: RegistryEntry): Promise<void> {
  ensureDirFor(file);
  await appendFile(file, `${JSON.stringify(entry)}\n`);
}

export function appendRegistryEntry(file: string, entry: RegistryEntry): Promise<void> {
  writeChain = writeChain.then(() => doAppend(file, entry));
  return writeChain;
}

function parseLineOrNull(line: string): RegistryEntry | null {
  if (line.length === 0) return null;
  try {
    const parsed = JSON.parse(line) as Partial<RegistryEntry>;
    if (
      typeof parsed.server !== 'string' ||
      typeof parsed.tool_name !== 'string' ||
      typeof parsed.description !== 'string' ||
      typeof parsed.schema_hash !== 'string' ||
      typeof parsed.last_observed !== 'string'
    ) {
      return null;
    }
    return parsed as RegistryEntry;
  } catch {
    return null;
  }
}

function collapseLatestWins(entries: RegistryEntry[]): RegistryEntry[] {
  const latest = new Map<string, RegistryEntry>();
  for (const entry of entries) {
    const key = `${entry.server}\u0000${entry.tool_name}`;
    const prior = latest.get(key);
    if (!prior || prior.last_observed < entry.last_observed) {
      latest.set(key, entry);
    }
  }
  return [...latest.values()];
}

function isExpired(entry: RegistryEntry, now: number): boolean {
  const observedMs = Date.parse(entry.last_observed);
  if (Number.isNaN(observedMs)) return true;
  return now - observedMs >= TTL_MS;
}

export function readActiveRegistry(file: string): RegistryEntry[] {
  if (!existsSync(file)) return [];
  const raw = readFileSync(file, 'utf-8');
  if (raw.length === 0) return [];

  const parsed: RegistryEntry[] = [];
  for (const line of raw.split('\n')) {
    const entry = parseLineOrNull(line);
    if (entry !== null) parsed.push(entry);
  }

  const collapsed = collapseLatestWins(parsed);
  const now = Date.now();
  return collapsed.filter((entry) => !isExpired(entry, now));
}

function buildTempPath(target: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return join(dirname(target), `${target.split('/').pop()}.tmp.${ts}.${rand}`);
}

async function doCompact(file: string): Promise<void> {
  if (!existsSync(file)) return;
  const active = readActiveRegistry(file);
  const tmp = buildTempPath(file);
  try {
    writeFileSync(tmp, active.map((e) => JSON.stringify(e)).join('\n') + (active.length > 0 ? '\n' : ''));
    renameSync(tmp, file);
  } catch (err) {
    cleanupTemp(tmp);
    throw err;
  }
}

function cleanupTemp(tmp: string): void {
  try {
    unlinkSync(tmp);
  } catch {
    return;
  }
}

export function compactRegistry(file: string): Promise<void> {
  writeChain = writeChain.then(() => doCompact(file));
  return writeChain;
}

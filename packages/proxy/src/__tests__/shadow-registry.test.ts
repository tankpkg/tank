import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendRegistryEntry,
  compactRegistry,
  readActiveRegistry,
  type RegistryEntry
} from '~/scanner/shadow-registry.js';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'tank-shadow-reg-'));
  file = path.join(dir, 'registry.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

function entry(server: string, toolName: string, lastObservedIso: string, description = ''): RegistryEntry {
  return {
    server,
    tool_name: toolName,
    description,
    schema_hash: `sha256:${toolName}`,
    last_observed: lastObservedIso
  };
}

describe('appendRegistryEntry — C43 append on every tools/list observation', () => {
  it('creates the registry file if missing and writes one JSONL line', async () => {
    await appendRegistryEntry(file, entry('server-a', 'read_file', '2026-04-20T12:00:00Z'));
    const raw = readFileSync(file, 'utf-8');
    expect(raw.split('\n').filter((l) => l.length > 0)).toHaveLength(1);
  });

  it('writes parseable JSON on each line with required fields', async () => {
    await appendRegistryEntry(file, entry('server-a', 'read_file', '2026-04-20T12:00:00Z', 'Read a file'));
    const raw = readFileSync(file, 'utf-8').trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      server: 'server-a',
      tool_name: 'read_file',
      description: 'Read a file',
      schema_hash: expect.any(String),
      last_observed: '2026-04-20T12:00:00Z'
    });
  });

  it('appends (does not overwrite) on subsequent calls', async () => {
    await appendRegistryEntry(file, entry('a', 't1', '2026-04-20T10:00:00Z'));
    await appendRegistryEntry(file, entry('b', 't2', '2026-04-20T11:00:00Z'));
    const lines = readFileSync(file, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
  });

  it('serializes concurrent appends — no interleaved bytes', async () => {
    await Promise.all([
      appendRegistryEntry(file, entry('a', 't1', '2026-04-20T10:00:00Z')),
      appendRegistryEntry(file, entry('b', 't2', '2026-04-20T10:00:00Z')),
      appendRegistryEntry(file, entry('c', 't3', '2026-04-20T10:00:00Z')),
      appendRegistryEntry(file, entry('d', 't4', '2026-04-20T10:00:00Z'))
    ]);
    const lines = readFileSync(file, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0);
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe('readActiveRegistry — C43 latest-wins per (server, tool_name)', () => {
  it('returns [] for a missing file', () => {
    expect(readActiveRegistry(file)).toEqual([]);
  });

  it('returns [] for an empty file', () => {
    writeFileSync(file, '');
    expect(readActiveRegistry(file)).toEqual([]);
  });

  it('parses a single well-formed entry', async () => {
    await appendRegistryEntry(file, entry('a', 't1', '2026-04-20T10:00:00Z'));
    const active = readActiveRegistry(file);
    expect(active).toHaveLength(1);
    expect(active[0]?.tool_name).toBe('t1');
  });

  it('collapses superseded entries — newer last_observed wins for same (server, tool)', async () => {
    await appendRegistryEntry(file, entry('a', 't1', '2026-04-01T00:00:00Z', 'OLD'));
    await appendRegistryEntry(file, entry('a', 't1', '2026-04-15T00:00:00Z', 'NEW'));
    const active = readActiveRegistry(file);
    expect(active).toHaveLength(1);
    expect(active[0]?.description).toBe('NEW');
    expect(active[0]?.last_observed).toBe('2026-04-15T00:00:00Z');
  });

  it('keeps entries from different servers with the same tool_name as separate actives', async () => {
    await appendRegistryEntry(file, entry('a', 'read_file', '2026-04-20T10:00:00Z'));
    await appendRegistryEntry(file, entry('b', 'read_file', '2026-04-20T11:00:00Z'));
    const active = readActiveRegistry(file);
    expect(active).toHaveLength(2);
    expect(active.map((e) => e.server).sort()).toEqual(['a', 'b']);
  });

  it('tolerates malformed JSON lines by skipping them', async () => {
    await appendRegistryEntry(file, entry('a', 't1', '2026-04-20T10:00:00Z'));
    const raw = readFileSync(file, 'utf-8');
    writeFileSync(file, `${raw}{not json\n`);
    const active = readActiveRegistry(file);
    expect(active).toHaveLength(1);
  });

  it('evicts entries older than 30 days (C46)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
    writeFileSync(
      file,
      [
        JSON.stringify(entry('a', 'old', '2026-03-20T11:59:59Z')),
        JSON.stringify(entry('a', 'fresh', '2026-04-20T00:00:00Z'))
      ].join('\n') + '\n'
    );
    const active = readActiveRegistry(file);
    expect(active.map((e) => e.tool_name)).toEqual(['fresh']);
  });

  it('retains entries at exactly 30 days minus 1 second (C46 boundary)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
    writeFileSync(file, `${JSON.stringify(entry('a', 'border', '2026-03-21T12:00:01Z'))}\n`);
    const active = readActiveRegistry(file);
    expect(active).toHaveLength(1);
  });
});

describe('compactRegistry — C46 rewrite file omitting expired/superseded entries', () => {
  it('produces a registry whose contents equal readActiveRegistry output', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
    await appendRegistryEntry(file, entry('a', 'expired', '2026-03-01T00:00:00Z'));
    await appendRegistryEntry(file, entry('a', 't1', '2026-04-01T00:00:00Z', 'OLD'));
    await appendRegistryEntry(file, entry('a', 't1', '2026-04-19T00:00:00Z', 'NEW'));
    await appendRegistryEntry(file, entry('b', 't2', '2026-04-19T00:00:00Z'));

    await compactRegistry(file);

    const raw = readFileSync(file, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const entries = lines.map((l) => JSON.parse(l) as RegistryEntry);
    expect(entries).toHaveLength(2);
    const t1 = entries.find((e) => e.tool_name === 't1');
    expect(t1?.description).toBe('NEW');
    expect(entries.some((e) => e.tool_name === 'expired')).toBe(false);
  });

  it('atomic rewrite — intermediate .tmp file is never visible after compaction', async () => {
    await appendRegistryEntry(file, entry('a', 't1', '2026-04-19T00:00:00Z'));
    await compactRegistry(file);
    const siblings = readdirSync(path.dirname(file));
    const leftoverTemps = siblings.filter((f) => f.includes('.tmp'));
    expect(leftoverTemps).toEqual([]);
  });

  it('is a no-op when the file does not exist', async () => {
    await expect(compactRegistry(file)).resolves.not.toThrow();
    expect(existsSync(file)).toBe(false);
  });
});

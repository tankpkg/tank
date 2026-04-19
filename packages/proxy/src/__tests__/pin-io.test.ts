import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type PinFile, PinReadError, readPinFile, sweepStaleTemps, writePinFile } from '~/scanner/pin-io.js';

const SAMPLE_PIN: PinFile = {
  packageHash: 'sha256:abc123',
  pinnedAt: '2026-04-19T12:00:00.000Z',
  tools: { read_file: 'sha256:deadbeef' }
};

describe('writePinFile: atomic rename via unique temp (C14b)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-pin-io-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the target file with valid JSON payload', () => {
    const target = path.join(dir, 'abc123.json');
    writePinFile(target, SAMPLE_PIN);
    const parsed = JSON.parse(fs.readFileSync(target, 'utf-8')) as PinFile;
    expect(parsed).toEqual(SAMPLE_PIN);
  });

  it('cleans up its temp file after rename (no stray <hash>.json.tmp.*)', () => {
    const target = path.join(dir, 'abc123.json');
    writePinFile(target, SAMPLE_PIN);
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp.'));
    expect(leftovers).toEqual([]);
  });

  it('creates parent directory with mode 0700 when missing (C14)', () => {
    const nested = path.join(dir, 'pins', 'xyz.json');
    writePinFile(nested, SAMPLE_PIN);
    const stats = fs.statSync(path.dirname(nested));
    expect(stats.isDirectory()).toBe(true);
    if (process.platform !== 'win32') {
      expect(stats.mode & 0o777).toBe(0o700);
    }
  });

  it('two sequential writes of the same target produce valid final JSON (last-wins)', () => {
    const target = path.join(dir, 'abc123.json');
    writePinFile(target, SAMPLE_PIN);
    const second: PinFile = { ...SAMPLE_PIN, pinnedAt: '2026-04-20T00:00:00.000Z' };
    writePinFile(target, second);
    const parsed = JSON.parse(fs.readFileSync(target, 'utf-8')) as PinFile;
    expect(parsed.pinnedAt).toBe('2026-04-20T00:00:00.000Z');
  });

  it('overlapping writes by two callers converge to a parseable file', () => {
    const target = path.join(dir, 'abc123.json');
    writePinFile(target, SAMPLE_PIN);
    writePinFile(target, SAMPLE_PIN);
    const content = fs.readFileSync(target, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });
});

describe('readPinFile: fail-closed semantics (C14c)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-pin-io-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the pin file does not exist (ENOENT is benign first-run)', () => {
    expect(readPinFile(path.join(dir, 'missing.json'))).toBeNull();
  });

  it('returns the parsed pin when the file exists and is valid JSON', () => {
    const target = path.join(dir, 'abc123.json');
    writePinFile(target, SAMPLE_PIN);
    expect(readPinFile(target)).toEqual(SAMPLE_PIN);
  });

  it('throws PinReadError on corrupt JSON (must NOT silently re-pin)', () => {
    const target = path.join(dir, 'abc123.json');
    fs.writeFileSync(target, '{not json');
    expect(() => readPinFile(target)).toThrow(PinReadError);
  });

  it('throws PinReadError when JSON parses but does not match PinFile shape', () => {
    const target = path.join(dir, 'abc123.json');
    fs.writeFileSync(target, '{"totally":"wrong"}');
    expect(() => readPinFile(target)).toThrow(PinReadError);
  });
});

describe('sweepStaleTemps: startup cleanup (C14b)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-pin-io-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('deletes .tmp.* files older than the threshold', () => {
    const stale = path.join(dir, 'abc.json.tmp.9999.deadbeef');
    fs.writeFileSync(stale, 'x');
    const twoHoursAgo = Date.now() / 1000 - 7200;
    fs.utimesSync(stale, twoHoursAgo, twoHoursAgo);
    sweepStaleTemps(dir);
    expect(fs.existsSync(stale)).toBe(false);
  });

  it('preserves .tmp.* files younger than the threshold', () => {
    const fresh = path.join(dir, 'abc.json.tmp.1234.deadbeef');
    fs.writeFileSync(fresh, 'x');
    sweepStaleTemps(dir);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('does not delete completed pin files', () => {
    const completed = path.join(dir, 'abc.json');
    writePinFile(completed, SAMPLE_PIN);
    const twoHoursAgo = Date.now() / 1000 - 7200;
    fs.utimesSync(completed, twoHoursAgo, twoHoursAgo);
    sweepStaleTemps(dir);
    expect(fs.existsSync(completed)).toBe(true);
  });

  it('is a no-op when the pins directory does not exist', () => {
    expect(() => sweepStaleTemps(path.join(dir, 'does-not-exist'))).not.toThrow();
  });

  it('ignores non-matching temp filenames (e.g. .tmp without pid suffix)', () => {
    const wrongShape = path.join(dir, 'a.json.tmp');
    fs.writeFileSync(wrongShape, 'x');
    const oneHourAgo = Date.now() / 1000 - 3700;
    fs.utimesSync(wrongShape, oneHourAgo, oneHourAgo);
    sweepStaleTemps(dir);
    expect(fs.existsSync(wrongShape)).toBe(true);
  });
});

describe('readPinFile: filesystem hostile conditions (edge-case)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-pin-io-hostile-'));
  });
  afterEach(() => {
    if (process.platform !== 'win32' && fs.existsSync(dir)) {
      fs.chmodSync(dir, 0o700);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('throws PinReadError when the target path is a directory, not a file', () => {
    const target = path.join(dir, 'abc.json');
    fs.mkdirSync(target);
    expect(() => readPinFile(target)).toThrow(PinReadError);
  });

  it.skipIf(process.platform === 'win32')(
    'throws PinReadError when the pin file exists but is not readable (EACCES)',
    () => {
      const target = path.join(dir, 'abc.json');
      writePinFile(target, SAMPLE_PIN);
      fs.chmodSync(target, 0o000);
      try {
        expect(() => readPinFile(target)).toThrow(PinReadError);
      } finally {
        fs.chmodSync(target, 0o600);
      }
    }
  );

  it('throws PinReadError when the JSON payload is an array, not an object', () => {
    const target = path.join(dir, 'abc.json');
    fs.writeFileSync(target, '[1,2,3]');
    expect(() => readPinFile(target)).toThrow(PinReadError);
  });

  it('throws PinReadError when the JSON payload is null', () => {
    const target = path.join(dir, 'abc.json');
    fs.writeFileSync(target, 'null');
    expect(() => readPinFile(target)).toThrow(PinReadError);
  });

  it('throws PinReadError when tools field is missing from a valid JSON object', () => {
    const target = path.join(dir, 'abc.json');
    fs.writeFileSync(target, JSON.stringify({ packageHash: 'x', pinnedAt: 'y' }));
    expect(() => readPinFile(target)).toThrow(PinReadError);
  });
});

describe('writePinFile: filesystem hostile conditions (edge-case)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-pin-io-write-hostile-'));
  });
  afterEach(() => {
    if (process.platform !== 'win32' && fs.existsSync(dir)) {
      fs.chmodSync(dir, 0o700);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(process.platform === 'win32')(
    'surfaces the write error when parent directory is read-only (EACCES)',
    () => {
      fs.chmodSync(dir, 0o500);
      const target = path.join(dir, 'abc.json');
      expect(() => writePinFile(target, SAMPLE_PIN)).toThrow();
    }
  );

  it('leaves no stale temp file when the rename step fails (target is a directory)', () => {
    const target = path.join(dir, 'abc.json');
    fs.mkdirSync(target);
    expect(() => writePinFile(target, SAMPLE_PIN)).toThrow();
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp.'));
    expect(leftovers).toEqual([]);
  });
});

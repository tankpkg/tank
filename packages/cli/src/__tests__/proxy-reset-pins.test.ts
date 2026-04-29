import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { proxyResetPinsCommand } from '~/commands/proxy-reset-pins.js';

describe('proxyResetPinsCommand (C15)', () => {
  let dir: string;
  let pinsDir: string;
  let log: string[];
  const logger = (line: string) => {
    log.push(line);
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-reset-'));
    pinsDir = path.join(dir, 'pins');
    log = [];
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('deletes every <hash>.json under pinsDir and reports the count', () => {
    fs.mkdirSync(pinsDir, { recursive: true });
    fs.writeFileSync(path.join(pinsDir, 'a.json'), '{}');
    fs.writeFileSync(path.join(pinsDir, 'b.json'), '{}');
    proxyResetPinsCommand({ pinsDir, log: logger });
    expect(fs.readdirSync(pinsDir)).toEqual([]);
    expect(log.some((l) => l.includes('2'))).toBe(true);
  });

  it('preserves the pins directory itself after deletion', () => {
    fs.mkdirSync(pinsDir, { recursive: true });
    fs.writeFileSync(path.join(pinsDir, 'a.json'), '{}');
    proxyResetPinsCommand({ pinsDir, log: logger });
    expect(fs.existsSync(pinsDir)).toBe(true);
  });

  it('reports 0 when directory is empty without throwing', () => {
    fs.mkdirSync(pinsDir, { recursive: true });
    proxyResetPinsCommand({ pinsDir, log: logger });
    expect(log.some((l) => l.includes('0'))).toBe(true);
  });

  it('reports 0 when directory does not exist without throwing', () => {
    proxyResetPinsCommand({ pinsDir, log: logger });
    expect(log.some((l) => l.includes('0'))).toBe(true);
  });

  it('does not exit the process (callers may launch the proxy afterward)', () => {
    const before = process.exitCode;
    fs.mkdirSync(pinsDir, { recursive: true });
    proxyResetPinsCommand({ pinsDir, log: logger });
    expect(process.exitCode).toBe(before);
  });

  it('ignores non-json files (only deletes pin files)', () => {
    fs.mkdirSync(pinsDir, { recursive: true });
    fs.writeFileSync(path.join(pinsDir, 'readme.txt'), 'not a pin');
    fs.writeFileSync(path.join(pinsDir, 'a.json'), '{}');
    proxyResetPinsCommand({ pinsDir, log: logger });
    expect(fs.existsSync(path.join(pinsDir, 'readme.txt'))).toBe(true);
    expect(fs.existsSync(path.join(pinsDir, 'a.json'))).toBe(false);
  });
});

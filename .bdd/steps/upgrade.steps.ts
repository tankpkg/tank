/**
 * BDD step definitions for the upgrade command.
 *
 * Intent: .idd/modules/upgrade/INTENT.md
 * Feature: .bdd/features/upgrade/upgrade.feature
 *
 * Tests upgradeCommand() behavior via captured console output.
 * fetch() is replaced per-scenario to simulate GitHub Releases API.
 * No real network calls are made.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { upgradeCommand } from '../../packages/cli/src/commands/upgrade.js';
import { VERSION } from '../../packages/cli/src/version.js';

// ── World ──────────────────────────────────────────────────────────────────

interface UpgradeWorld {
  capturedOutput: string[];
  tmpDir: string;
  origFetch: typeof fetch;
  origArgv: string[];
  fetchCallUrls: string[];
}

const world: UpgradeWorld = {
  capturedOutput: [],
  tmpDir: '',
  origFetch: globalThis.fetch,
  origArgv: [],
  fetchCallUrls: []
};

// ── Helpers ────────────────────────────────────────────────────────────────

function captureConsole(): () => string[] {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  return () => {
    console.log = origLog;
    return lines;
  };
}

function setMockFetch(impl: (url: string) => Promise<Response>): void {
  world.fetchCallUrls = [];
  const wrapped = async (url: string | URL, _init?: RequestInit): Promise<Response> => {
    const urlStr = url.toString();
    world.fetchCallUrls.push(urlStr);
    return impl(urlStr);
  };
  globalThis.fetch = wrapped as unknown as typeof fetch;
}

function makeFakeReleaseFetch(tagName: string): (url: string) => Promise<Response> {
  return async (url: string) => {
    if (url.includes('releases/latest')) {
      return { ok: true, status: 200, json: async () => ({ tag_name: `v${tagName}` }) } as Response;
    }
    return { ok: false, status: 404, statusText: 'Not Found' } as Response;
  };
}

function binaryName(): string {
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `tank-${platform}-${arch}`;
}

function makeFakeFullUpgradeFetch(targetVersion: string, useWrongChecksum = false): (url: string) => Promise<Response> {
  const binContent = Buffer.from(`fake-tank-binary-${targetVersion}`);
  const correctHash = crypto.createHash('sha256').update(binContent).digest('hex');
  const checksumHash = useWrongChecksum
    ? 'aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233'
    : correctHash;
  const sumsText = `${checksumHash}  ${binaryName()}\n`;

  return async (url: string) => {
    if (url.includes('releases/latest')) {
      return { ok: true, status: 200, json: async () => ({ tag_name: `v${targetVersion}` }) } as Response;
    }
    if (url.includes('SHA256SUMS')) {
      return { ok: true, status: 200, text: async () => sumsText } as Response;
    }
    return {
      ok: true,
      status: 200,
      body: {},
      arrayBuffer: async () => binContent.buffer as ArrayBuffer
    } as unknown as Response;
  };
}

// ── Given ──────────────────────────────────────────────────────────────────

function givenCurrentVersionEqualsLatest(): void {
  setMockFetch(makeFakeReleaseFetch(VERSION));
}

function givenCurrentBinaryInCellar(): void {
  world.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-bdd-'));
  const fakeBin = path.join(world.tmpDir, 'Cellar', 'tank', 'bin', 'tank');
  fs.mkdirSync(path.dirname(fakeBin), { recursive: true });
  fs.writeFileSync(fakeBin, '#!/bin/sh\necho fake');
  world.origArgv = [...process.argv];
  process.argv = ['node', fakeBin, 'upgrade'];
  setMockFetch(makeFakeReleaseFetch('999.0.0'));
}

// ── When ───────────────────────────────────────────────────────────────────

async function whenIRunUpgrade(): Promise<void> {
  const stop = captureConsole();
  await upgradeCommand();
  world.capturedOutput = stop();
}

async function whenIRunUpgradeWithDryRun(targetVersion: string): Promise<void> {
  setMockFetch(makeFakeReleaseFetch(targetVersion));
  const stop = captureConsole();
  await upgradeCommand({ dryRun: true });
  world.capturedOutput = stop();
}

async function whenIRunUpgradeWithBadChecksum(targetVersion: string): Promise<void> {
  setMockFetch(makeFakeFullUpgradeFetch(targetVersion, true));
  const stop = captureConsole();
  await upgradeCommand({ force: true });
  world.capturedOutput = stop();
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenOutputContains(pattern: RegExp | string): void {
  const combined = world.capturedOutput.join('\n');
  if (pattern instanceof RegExp) {
    expect(combined).toMatch(pattern);
  } else {
    expect(combined).toContain(pattern);
  }
}

function thenNoBinaryDownloadOccurred(): void {
  const binaryUrls = world.fetchCallUrls.filter((u) => u.includes('/releases/download/'));
  expect(binaryUrls).toHaveLength(0);
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Self-upgrade Tank CLI binary', () => {
  beforeEach(() => {
    world.capturedOutput = [];
    world.origFetch = globalThis.fetch;
    world.origArgv = [...process.argv];
    world.fetchCallUrls = [];
  });

  afterEach(() => {
    globalThis.fetch = world.origFetch;
    process.argv = world.origArgv;
    if (world.tmpDir && fs.existsSync(world.tmpDir)) {
      fs.rmSync(world.tmpDir, { recursive: true, force: true });
    }
    world.tmpDir = '';
    world.capturedOutput = [];
  });

  // ── Already on latest (C2) ────────────────────────────────────────

  describe('Scenario: Already on latest version prints a message and exits (E1)', () => {
    it('runs Given/When/Then', async () => {
      givenCurrentVersionEqualsLatest();
      await whenIRunUpgrade();
      thenOutputContains(/Already on latest version/i);
      thenNoBinaryDownloadOccurred();
    });
  });

  // ── Dry run (C6) ──────────────────────────────────────────────────

  describe('Scenario: Dry run prints the upgrade target without downloading (E2)', () => {
    it('runs Given/When/Then', async () => {
      await whenIRunUpgradeWithDryRun('999.0.0');
      thenOutputContains(/Would upgrade/i);
      thenNoBinaryDownloadOccurred();
    });
  });

  // ── Checksum verification (C4, C5) ────────────────────────────────

  describe('Scenario: Checksum mismatch aborts the upgrade (E4)', () => {
    it('runs Given/When/Then', async () => {
      await whenIRunUpgradeWithBadChecksum('999.0.0');
      thenOutputContains(/Checksum mismatch. Aborting/i);
    });
  });

  // ── Homebrew detection (C7) ───────────────────────────────────────

  describe('Scenario: Homebrew-installed binary redirects to brew upgrade (E5)', () => {
    it('runs Given/When/Then', async () => {
      if (process.platform === 'win32') return;
      givenCurrentBinaryInCellar();
      const stop = captureConsole();
      await upgradeCommand();
      world.capturedOutput = stop();
      thenOutputContains('brew upgrade tank');
      thenNoBinaryDownloadOccurred();
    });
  });

  // ── Version bump detection (C1) ───────────────────────────────────

  describe('Scenario: isNewerVersion correctly identifies semantic version ordering', () => {
    it('1.2.4 is newer than current — dry run shows upgrade target', async () => {
      await whenIRunUpgradeWithDryRun('999.0.0');
      thenOutputContains(/Would upgrade/i);
    });

    it('same version as current shows already on latest', async () => {
      givenCurrentVersionEqualsLatest();
      await whenIRunUpgrade();
      thenOutputContains(/Already on latest version/i);
    });
  });
});

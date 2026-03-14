/**
 * BDD step definitions for the migrate command.
 *
 * Intent: .idd/modules/migrate/INTENT.md
 * Feature: .bdd/features/migrate/migrate.feature
 *
 * Filesystem-only — no DB, no HTTP, no mocks.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { migrateCommand } from '../../packages/cli/src/commands/migrate.js';

// ── World ──────────────────────────────────────────────────────────────────

interface MigrateWorld {
  dir: string;
  lastOutput: string[];
}

const world: MigrateWorld = {
  dir: '',
  lastOutput: []
};

// ── Helpers ────────────────────────────────────────────────────────────────

function captureLogger(): () => string[] {
  const lines: string[] = [];
  const origLog = console.log;
  const origInfo = console.info;
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  console.info = (...args: unknown[]) => lines.push(args.join(' '));
  return () => {
    console.log = origLog;
    console.info = origInfo;
    return lines;
  };
}

// ── Given ──────────────────────────────────────────────────────────────────

function givenDirWithBothLegacyFiles(): void {
  world.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-migrate-bdd-'));
  fs.writeFileSync(path.join(world.dir, 'skills.json'), JSON.stringify({ skills: {} }));
  fs.writeFileSync(path.join(world.dir, 'skills.lock'), JSON.stringify({ lockfileVersion: 1, skills: {} }));
}

function givenDirWithOnlySkillsJson(): void {
  world.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-migrate-bdd-'));
  fs.writeFileSync(path.join(world.dir, 'skills.json'), JSON.stringify({ skills: {} }));
}

function givenDirWithSkillsJsonAndTankJson(): void {
  world.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-migrate-bdd-'));
  fs.writeFileSync(path.join(world.dir, 'skills.json'), JSON.stringify({ skills: {} }));
  fs.writeFileSync(path.join(world.dir, 'tank.json'), JSON.stringify({ skills: {} }));
}

function givenDirWithNoLegacyFiles(): void {
  world.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-migrate-bdd-'));
}

// ── When ───────────────────────────────────────────────────────────────────

async function whenIRunMigrateCommand(): Promise<void> {
  const stopCapture = captureLogger();
  await migrateCommand({ directory: world.dir });
  world.lastOutput = stopCapture();
}

async function whenIRunMigrateCommandTwice(): Promise<void> {
  await migrateCommand({ directory: world.dir });
  const stopCapture = captureLogger();
  await migrateCommand({ directory: world.dir });
  world.lastOutput = stopCapture();
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenFileExists(filename: string): void {
  expect(fs.existsSync(path.join(world.dir, filename))).toBe(true);
}

function thenFileDoesNotExist(filename: string): void {
  expect(fs.existsSync(path.join(world.dir, filename))).toBe(false);
}

function thenOutputContains(pattern: RegExp | string): void {
  const combined = world.lastOutput.join('\n');
  if (pattern instanceof RegExp) {
    expect(combined).toMatch(pattern);
  } else {
    expect(combined.toLowerCase()).toContain(pattern.toLowerCase());
  }
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Migrate legacy skills.json/skills.lock to tank.json/tank.lock', () => {
  afterEach(() => {
    if (world.dir && fs.existsSync(world.dir)) {
      fs.rmSync(world.dir, { recursive: true, force: true });
    }
    world.dir = '';
    world.lastOutput = [];
  });

  // ── Both files present (C1, C2, C6) ─────────────────────────────

  describe('Scenario: Migrating a directory with both legacy files copies both (E1)', () => {
    it('runs Given/When/Then', async () => {
      givenDirWithBothLegacyFiles();
      await whenIRunMigrateCommand();
      thenFileExists('tank.json');
      thenFileExists('tank.lock');
      thenFileExists('skills.json');
      thenFileExists('skills.lock');
    });
  });

  // ── Partial migration (C1) ────────────────────────────────────────

  describe('Scenario: Migrating when only skills.json exists skips lockfile (E2)', () => {
    it('runs Given/When/Then', async () => {
      givenDirWithOnlySkillsJson();
      await whenIRunMigrateCommand();
      thenFileExists('tank.json');
      thenFileDoesNotExist('tank.lock');
    });
  });

  // ── Idempotency (C3, C4) ──────────────────────────────────────────

  describe('Scenario: Migrating when tank.json already exists skips manifest (E3)', () => {
    it('runs Given/When/Then', async () => {
      givenDirWithSkillsJsonAndTankJson();
      await whenIRunMigrateCommand();
      thenOutputContains('already exists');
    });
  });

  describe('Scenario: Running migrate twice is a no-op on second run (E5)', () => {
    it('runs Given/When/Then — no error on second run', async () => {
      givenDirWithOnlySkillsJson();
      await expect(whenIRunMigrateCommandTwice()).resolves.toBeUndefined();
    });
  });

  // ── Nothing to migrate (C5) ───────────────────────────────────────

  describe('Scenario: Directory with no legacy files prints nothing to migrate (E4)', () => {
    it('runs Given/When/Then', async () => {
      givenDirWithNoLegacyFiles();
      await whenIRunMigrateCommand();
      thenOutputContains(/nothing to migrate|already migrated/i);
    });
  });
});

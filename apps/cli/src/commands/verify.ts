import fs from 'node:fs';
import path from 'node:path';
import { readLockfile } from '../lib/lockfile.js';
import { logger } from '../lib/logger.js';

export interface VerifyOptions {
  directory?: string;
}

export interface VerifyResult {
  valid: boolean;
  mismatches: Array<{
    key: string;
    expected: string;
    actual: string | null; // null if file missing
  }>;
}

/**
 * Verify that installed skills match the lockfile.
 *
 * For each entry in skills.lock:
 * 1. Parse the skill name from the lock key
 * 2. Check that the skill directory exists in .tank/skills/
 * 3. Check that the directory is not empty
 *
 * Throws on failure (exit code 1). Prints success message on pass.
 */
export async function verifyCommand(options?: VerifyOptions): Promise<void> {
  const directory = options?.directory ?? process.cwd();

  const lock = readLockfile(directory);
  if (!lock) {
    throw new Error(`No skills.lock found in ${directory}. Run: tank install`);
  }

  const entries = Object.entries(lock.skills);
  if (entries.length === 0) {
    logger.success('No skills to verify (lockfile is empty)');
    return;
  }

  const issues: string[] = [];

  for (const [key] of entries) {
    const skillName = parseLockKey(key);
    const skillDir = getExtractDir(directory, skillName);

    if (!fs.existsSync(skillDir)) {
      issues.push(`${key}: directory missing at ${skillDir}`);
      continue;
    }

    // Check directory is not empty
    const contents = fs.readdirSync(skillDir);
    if (contents.length === 0) {
      issues.push(`${key}: directory exists but is empty`);
    }
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      logger.error(issue);
    }
    throw new Error(
      `Verification failed: ${issues.length} issue${issues.length === 1 ? '' : 's'} found`,
    );
  }

  const count = entries.length;
  logger.success(`All ${count} skill${count === 1 ? '' : 's'} verified`);
}

function parseLockKey(key: string): string {
  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0) {
    throw new Error(`Invalid lockfile key: ${key}`);
  }
  return key.slice(0, lastAt);
}

function getExtractDir(projectDir: string, skillName: string): string {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(projectDir, '.tank', 'skills', scope, name);
  }
  return path.join(projectDir, '.tank', 'skills', skillName);
}

import fs from 'node:fs';
import path from 'node:path';
import type { SkillsLock, Permissions } from '@tank/shared';

/**
 * Read and parse the lockfile from the given directory.
 * Returns null if the file doesn't exist or is corrupt.
 */
export function readLockfile(directory?: string): SkillsLock | null {
  const dir = directory ?? process.cwd();
  const lockPath = path.join(dir, 'skills.lock');

  if (!fs.existsSync(lockPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    return JSON.parse(raw) as SkillsLock;
  } catch {
    return null;
  }
}

/**
 * Write a lockfile deterministically: sorted keys, consistent formatting, trailing newline.
 */
export function writeLockfile(lock: SkillsLock, directory?: string): void {
  const dir = directory ?? process.cwd();
  const lockPath = path.join(dir, 'skills.lock');

  // Sort skill keys alphabetically for determinism
  const sortedSkills: Record<string, SkillsLock['skills'][string]> = {};
  for (const key of Object.keys(lock.skills).sort()) {
    sortedSkills[key] = lock.skills[key];
  }

  const output: SkillsLock = {
    lockfileVersion: lock.lockfileVersion,
    skills: sortedSkills,
  };

  fs.writeFileSync(lockPath, JSON.stringify(output, null, 2) + '\n');
}

/**
 * Compute the union of all skill permissions from a lockfile.
 * Merges network outbound, filesystem read/write (deduped), and subprocess (OR).
 */
export function computeResolvedPermissions(lock: SkillsLock): Permissions {
  const entries = Object.values(lock.skills);
  if (entries.length === 0) {
    return {};
  }

  const outbound = new Set<string>();
  const fsRead = new Set<string>();
  const fsWrite = new Set<string>();
  let subprocess = false;

  for (const entry of entries) {
    const perms = entry.permissions;

    if (perms.network?.outbound) {
      for (const domain of perms.network.outbound) {
        outbound.add(domain);
      }
    }

    if (perms.filesystem?.read) {
      for (const pattern of perms.filesystem.read) {
        fsRead.add(pattern);
      }
    }

    if (perms.filesystem?.write) {
      for (const pattern of perms.filesystem.write) {
        fsWrite.add(pattern);
      }
    }

    if (perms.subprocess === true) {
      subprocess = true;
    }
  }

  const result: Permissions = {};

  if (outbound.size > 0) {
    result.network = { outbound: [...outbound].sort() };
  }

  if (fsRead.size > 0 || fsWrite.size > 0) {
    result.filesystem = {};
    if (fsRead.size > 0) {
      result.filesystem.read = [...fsRead].sort();
    }
    if (fsWrite.size > 0) {
      result.filesystem.write = [...fsWrite].sort();
    }
  }

  if (subprocess) {
    result.subprocess = true;
  }

  return result;
}

/**
 * Check if resolved permissions fit within the project's permission budget.
 *
 * Returns:
 * - 'pass' if all resolved permissions are within budget
 * - 'fail' if any resolved permission exceeds budget
 * - 'no_budget' if no project permissions are defined
 */
export function computeBudgetCheck(
  resolvedPermissions: Permissions,
  projectPermissions: Permissions | undefined,
): 'pass' | 'fail' | 'no_budget' {
  if (projectPermissions === undefined) {
    return 'no_budget';
  }

  // Check subprocess
  if (resolvedPermissions.subprocess === true && projectPermissions.subprocess === false) {
    return 'fail';
  }

  // Check network outbound
  if (resolvedPermissions.network?.outbound) {
    const budgetOutbound = new Set(projectPermissions.network?.outbound ?? []);
    for (const domain of resolvedPermissions.network.outbound) {
      if (!budgetOutbound.has(domain)) {
        return 'fail';
      }
    }
  }

  // Check filesystem read
  if (resolvedPermissions.filesystem?.read) {
    const budgetRead = new Set(projectPermissions.filesystem?.read ?? []);
    for (const pattern of resolvedPermissions.filesystem.read) {
      if (!budgetRead.has(pattern)) {
        return 'fail';
      }
    }
  }

  // Check filesystem write
  if (resolvedPermissions.filesystem?.write) {
    const budgetWrite = new Set(projectPermissions.filesystem?.write ?? []);
    for (const pattern of resolvedPermissions.filesystem.write) {
      if (!budgetWrite.has(pattern)) {
        return 'fail';
      }
    }
  }

  return 'pass';
}

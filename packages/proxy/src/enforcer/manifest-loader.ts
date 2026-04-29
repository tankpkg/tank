import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LEGACY_LOCKFILE_FILENAME,
  LEGACY_MANIFEST_FILENAME,
  LOCKFILE_FILENAME,
  MANIFEST_FILENAME,
  type Permissions,
  permissionsSchema,
  skillsLockSchema
} from '@internals/schemas';

export type EnforcementBudget = Permissions;

const MAX_UPWARD_LEVELS = 32;

export interface BudgetResult {
  found: boolean;
  source: 'tank.lock' | 'tank.json' | null;
  budget: EnforcementBudget | null;
}

function findFileUpward(cwd: string, filenames: readonly string[]): string | null {
  let current = path.resolve(cwd);
  for (let i = 0; i < MAX_UPWARD_LEVELS; i++) {
    for (const name of filenames) {
      const candidate = path.join(current, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

function readJsonFile(filePath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function unionStringArrays(...arrays: Array<readonly string[] | undefined>): string[] {
  const set = new Set<string>();
  for (const arr of arrays) {
    if (!arr) continue;
    for (const item of arr) set.add(item);
  }
  return [...set];
}

function budgetFromLockfile(lockPath: string): EnforcementBudget | null {
  const parsed = readJsonFile(lockPath);
  if (parsed === null) return null;
  const result = skillsLockSchema.safeParse(parsed);
  if (!result.success) return null;
  const outbound: string[] = [];
  const read: string[] = [];
  const write: string[] = [];
  let subprocess = false;
  for (const skill of Object.values(result.data.skills)) {
    outbound.push(...(skill.permissions.network?.outbound ?? []));
    read.push(...(skill.permissions.filesystem?.read ?? []));
    write.push(...(skill.permissions.filesystem?.write ?? []));
    if (skill.permissions.subprocess === true) subprocess = true;
  }
  return {
    network: { outbound: unionStringArrays(outbound) },
    filesystem: { read: unionStringArrays(read), write: unionStringArrays(write) },
    subprocess
  };
}

function budgetFromManifest(manifestPath: string): EnforcementBudget | null {
  const parsed = readJsonFile(manifestPath);
  if (parsed === null || typeof parsed !== 'object') return null;
  const perms = (parsed as { permissions?: unknown }).permissions;
  if (perms === undefined) return null;
  const result = permissionsSchema.safeParse(perms);
  return result.success ? result.data : null;
}

export function loadEnforcementBudget(cwd: string): BudgetResult {
  const lockPath = findFileUpward(cwd, [LOCKFILE_FILENAME, LEGACY_LOCKFILE_FILENAME]);
  if (lockPath) {
    const budget = budgetFromLockfile(lockPath);
    if (budget !== null) {
      return { found: true, source: 'tank.lock', budget };
    }
  }
  const manifestPath = findFileUpward(cwd, [MANIFEST_FILENAME, LEGACY_MANIFEST_FILENAME]);
  if (manifestPath) {
    const budget = budgetFromManifest(manifestPath);
    if (budget !== null) {
      return { found: true, source: 'tank.json', budget };
    }
  }
  return { found: false, source: null, budget: null };
}

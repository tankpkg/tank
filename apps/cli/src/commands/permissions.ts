import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type { Permissions, SkillsLock, SkillsJson } from '@tank/shared';

export interface PermissionsOptions {
  directory?: string;
}

/**
 * Parse a lockfile key like "@org/skill@1.0.0" into the skill name "@org/skill".
 */
function parseSkillName(key: string): string {
  const lastAt = key.lastIndexOf('@');
  // For scoped packages, lastIndexOf('@') finds the version separator
  // e.g. "@org/skill@1.0.0" → lastAt = 10, name = "@org/skill"
  if (lastAt > 0) {
    return key.slice(0, lastAt);
  }
  return key;
}

interface PermissionEntry {
  value: string;
  skills: string[];
}

interface ResolvedPermissions {
  networkOutbound: PermissionEntry[];
  filesystemRead: PermissionEntry[];
  filesystemWrite: PermissionEntry[];
  subprocess: string[]; // list of skill names that request subprocess
}

function collectPermissions(lockfile: SkillsLock): ResolvedPermissions {
  const networkMap = new Map<string, string[]>();
  const fsReadMap = new Map<string, string[]>();
  const fsWriteMap = new Map<string, string[]>();
  const subprocessSkills: string[] = [];

  for (const [key, entry] of Object.entries(lockfile.skills)) {
    const skillName = parseSkillName(key);
    const perms = entry.permissions;

    if (perms.network?.outbound) {
      for (const domain of perms.network.outbound) {
        const existing = networkMap.get(domain) ?? [];
        existing.push(skillName);
        networkMap.set(domain, existing);
      }
    }

    if (perms.filesystem?.read) {
      for (const p of perms.filesystem.read) {
        const existing = fsReadMap.get(p) ?? [];
        existing.push(skillName);
        fsReadMap.set(p, existing);
      }
    }

    if (perms.filesystem?.write) {
      for (const p of perms.filesystem.write) {
        const existing = fsWriteMap.get(p) ?? [];
        existing.push(skillName);
        fsWriteMap.set(p, existing);
      }
    }

    if (perms.subprocess === true) {
      subprocessSkills.push(skillName);
    }
  }

  const toEntries = (map: Map<string, string[]>): PermissionEntry[] =>
    Array.from(map.entries()).map(([value, skills]) => ({ value, skills }));

  return {
    networkOutbound: toEntries(networkMap),
    filesystemRead: toEntries(fsReadMap),
    filesystemWrite: toEntries(fsWriteMap),
    subprocess: subprocessSkills,
  };
}

/**
 * Check if a domain is allowed by the budget's domain list.
 * Supports wildcard matching: *.example.com matches sub.example.com
 */
function isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
  for (const allowed of allowedDomains) {
    if (allowed === domain) return true;
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1);
      if (domain.endsWith(suffix) || domain === allowed.slice(2)) {
        return true;
      }
      if (domain === allowed) return true;
    }
  }
  return false;
}

/**
 * Check if a path is allowed by the budget's path list.
 */
function isPathAllowed(requestedPath: string, allowedPaths: string[]): boolean {
  for (const allowed of allowedPaths) {
    if (allowed === requestedPath) return true;
    if (allowed.endsWith('/**')) {
      const prefix = allowed.slice(0, -3);
      if (requestedPath.startsWith(prefix)) return true;
    }
  }
  return false;
}

interface BudgetViolation {
  category: string;
  value: string;
  skills: string[];
}

function checkBudget(
  resolved: ResolvedPermissions,
  budget: Permissions,
): BudgetViolation[] {
  const violations: BudgetViolation[] = [];

  const budgetDomains = budget.network?.outbound ?? [];
  for (const entry of resolved.networkOutbound) {
    if (!isDomainAllowed(entry.value, budgetDomains)) {
      violations.push({
        category: 'network outbound',
        value: entry.value,
        skills: entry.skills,
      });
    }
  }

  const budgetReadPaths = budget.filesystem?.read ?? [];
  for (const entry of resolved.filesystemRead) {
    if (!isPathAllowed(entry.value, budgetReadPaths)) {
      violations.push({
        category: 'filesystem read',
        value: entry.value,
        skills: entry.skills,
      });
    }
  }

  const budgetWritePaths = budget.filesystem?.write ?? [];
  for (const entry of resolved.filesystemWrite) {
    if (!isPathAllowed(entry.value, budgetWritePaths)) {
      violations.push({
        category: 'filesystem write',
        value: entry.value,
        skills: entry.skills,
      });
    }
  }

  if (resolved.subprocess.length > 0 && budget.subprocess !== true) {
    violations.push({
      category: 'subprocess',
      value: 'subprocess access',
      skills: resolved.subprocess,
    });
  }

  return violations;
}

function formatAttribution(skills: string[]): string {
  return chalk.gray('← ' + skills.join(', '));
}

function printPermissionSection(
  title: string,
  entries: PermissionEntry[],
): void {
  console.log(`\n${chalk.bold(title)}:`);
  if (entries.length === 0) {
    console.log('  none');
  } else {
    for (const entry of entries) {
      console.log(`  ${entry.value}    ${formatAttribution(entry.skills)}`);
    }
  }
}

export async function permissionsCommand(options?: PermissionsOptions): Promise<void> {
  const dir = options?.directory ?? process.cwd();
  const lockfilePath = path.join(dir, 'skills.lock');

  // 1. Read lockfile
  if (!fs.existsSync(lockfilePath)) {
    console.log('No skills installed.');
    return;
  }

  const lockfileContent = fs.readFileSync(lockfilePath, 'utf-8');
  const lockfile: SkillsLock = JSON.parse(lockfileContent);

  if (!lockfile.skills || Object.keys(lockfile.skills).length === 0) {
    console.log('No skills installed.');
    return;
  }

  // 2. Collect permissions
  const resolved = collectPermissions(lockfile);

  // 3. Display
  console.log('\nResolved permissions for this project:\n');

  printPermissionSection('Network (outbound)', resolved.networkOutbound);
  printPermissionSection('Filesystem (read)', resolved.filesystemRead);
  printPermissionSection('Filesystem (write)', resolved.filesystemWrite);

  // Subprocess section
  console.log(`\n${chalk.bold('Subprocess')}:`);
  if (resolved.subprocess.length === 0) {
    console.log('  none');
  } else {
    console.log(`  allowed    ${formatAttribution(resolved.subprocess)}`);
  }

  // 4. Budget check
  const skillsJsonPath = path.join(dir, 'skills.json');
  let budget: Permissions | undefined;

  if (fs.existsSync(skillsJsonPath)) {
    const skillsJsonContent = fs.readFileSync(skillsJsonPath, 'utf-8');
    const skillsJson: SkillsJson = JSON.parse(skillsJsonContent);
    budget = skillsJson.permissions;
  }

  console.log('');

  if (!budget) {
    console.log(`Budget status: ${chalk.yellow('⚠ No budget defined')}`);
    return;
  }

  const violations = checkBudget(resolved, budget);

  if (violations.length === 0) {
    console.log(`Budget status: ${chalk.green('✓ PASS')} (all within budget)`);
  } else {
    console.log(`Budget status: ${chalk.red('✗ FAIL')}`);
    for (const v of violations) {
      console.log(chalk.red(`  - ${v.category}: "${v.value}" not in budget (requested by ${v.skills.join(', ')})`));
    }
  }
}

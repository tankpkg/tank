import type { Permissions } from '@internals/schemas';
import { TankPermissionError } from '../errors.js';

export interface PermissionViolation {
  skillName: string;
  type: 'network.outbound' | 'filesystem.read' | 'filesystem.write' | 'subprocess';
  requested: string;
}

export function checkPermissionBudget(
  budget: Permissions,
  skillPerms: Permissions | undefined,
  skillName: string
): void {
  if (!skillPerms) return;

  if (skillPerms.subprocess === true && budget.subprocess !== true) {
    throw new TankPermissionError(`${skillName} requires subprocess access, but project budget does not allow it`);
  }

  if (skillPerms.network?.outbound && skillPerms.network.outbound.length > 0) {
    const budgetDomains = budget.network?.outbound ?? [];
    for (const domain of skillPerms.network.outbound) {
      if (!isDomainAllowed(domain, budgetDomains)) {
        throw new TankPermissionError(
          `${skillName} requests network access to "${domain}", which is not in the project's permission budget`
        );
      }
    }
  }

  if (skillPerms.filesystem?.read && skillPerms.filesystem.read.length > 0) {
    const budgetPaths = budget.filesystem?.read ?? [];
    for (const p of skillPerms.filesystem.read) {
      if (!isPathAllowed(p, budgetPaths)) {
        throw new TankPermissionError(
          `${skillName} requests filesystem read access to "${p}", which is not in the project's permission budget`
        );
      }
    }
  }

  if (skillPerms.filesystem?.write && skillPerms.filesystem.write.length > 0) {
    const budgetPaths = budget.filesystem?.write ?? [];
    for (const p of skillPerms.filesystem.write) {
      if (!isPathAllowed(p, budgetPaths)) {
        throw new TankPermissionError(
          `${skillName} requests filesystem write access to "${p}", which is not in the project's permission budget`
        );
      }
    }
  }
}

export function isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
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

export function isPathAllowed(requestedPath: string, allowedPaths: string[]): boolean {
  const norm = (p: string) => p.replaceAll('\\', '/');
  const req = norm(requestedPath);

  if (req.includes('..')) return false;

  for (const allowed of allowedPaths) {
    const a = norm(allowed);
    if (a === req) return true;
    if (a.endsWith('/**')) {
      const prefix = a.slice(0, -3);
      if (req === prefix || req.startsWith(`${prefix}/`)) return true;
    }
  }
  return false;
}

export function collectPermissionViolations(
  budget: Permissions,
  skillPerms: Permissions | undefined,
  skillName: string
): PermissionViolation[] {
  const violations: PermissionViolation[] = [];
  if (!skillPerms) return violations;

  if (skillPerms.subprocess === true && budget.subprocess !== true) {
    violations.push({ skillName, type: 'subprocess', requested: 'true' });
  }

  if (skillPerms.network?.outbound) {
    const budgetDomains = budget.network?.outbound ?? [];
    for (const domain of skillPerms.network.outbound) {
      if (!isDomainAllowed(domain, budgetDomains)) {
        violations.push({ skillName, type: 'network.outbound', requested: domain });
      }
    }
  }

  if (skillPerms.filesystem?.read) {
    const budgetPaths = budget.filesystem?.read ?? [];
    for (const p of skillPerms.filesystem.read) {
      if (!isPathAllowed(p, budgetPaths)) {
        violations.push({ skillName, type: 'filesystem.read', requested: p });
      }
    }
  }

  if (skillPerms.filesystem?.write) {
    const budgetPaths = budget.filesystem?.write ?? [];
    for (const p of skillPerms.filesystem.write) {
      if (!isPathAllowed(p, budgetPaths)) {
        violations.push({ skillName, type: 'filesystem.write', requested: p });
      }
    }
  }

  return violations;
}

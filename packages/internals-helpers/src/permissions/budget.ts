import { isDomainAllowed } from './domain.js';
import { isPathAllowed } from './path.js';
import { PermissionBudgetError, type PermissionViolation } from './types.js';

export interface PermissionsShape {
  network?: { outbound?: string[] };
  filesystem?: { read?: string[]; write?: string[] };
  subprocess?: boolean;
}

export function checkPermissionBudget(
  budget: PermissionsShape,
  skillPerms: PermissionsShape | undefined,
  skillName: string
): void {
  if (!skillPerms) return;

  if (skillPerms.subprocess === true && budget.subprocess !== true) {
    throw new PermissionBudgetError(`${skillName} requires subprocess access, but project budget does not allow it`);
  }

  if (skillPerms.network?.outbound && skillPerms.network.outbound.length > 0) {
    const budgetDomains = budget.network?.outbound ?? [];
    for (const domain of skillPerms.network.outbound) {
      if (!isDomainAllowed(domain, budgetDomains)) {
        throw new PermissionBudgetError(
          `${skillName} requests network access to "${domain}", which is not in the project's permission budget`
        );
      }
    }
  }

  if (skillPerms.filesystem?.read && skillPerms.filesystem.read.length > 0) {
    const budgetPaths = budget.filesystem?.read ?? [];
    for (const p of skillPerms.filesystem.read) {
      if (!isPathAllowed(p, budgetPaths)) {
        throw new PermissionBudgetError(
          `${skillName} requests filesystem read access to "${p}", which is not in the project's permission budget`
        );
      }
    }
  }

  if (skillPerms.filesystem?.write && skillPerms.filesystem.write.length > 0) {
    const budgetPaths = budget.filesystem?.write ?? [];
    for (const p of skillPerms.filesystem.write) {
      if (!isPathAllowed(p, budgetPaths)) {
        throw new PermissionBudgetError(
          `${skillName} requests filesystem write access to "${p}", which is not in the project's permission budget`
        );
      }
    }
  }
}

export function collectPermissionViolations(
  budget: PermissionsShape,
  skillPerms: PermissionsShape | undefined,
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

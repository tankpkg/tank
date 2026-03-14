import type { Permissions } from '@internals/schemas';

/**
 * Check if a skill's permissions fit within the project's permission budget.
 * Throws if any permission exceeds the budget.
 */
export function checkPermissionBudget(
  budget: Permissions,
  skillPerms: Permissions | undefined,
  skillName: string
): void {
  if (!skillPerms) return;

  // Check subprocess
  if (skillPerms.subprocess === true && budget.subprocess !== true) {
    throw new Error(`Permission denied: ${skillName} requires subprocess access, but project budget does not allow it`);
  }

  // Check network outbound
  if (skillPerms.network?.outbound && skillPerms.network.outbound.length > 0) {
    const budgetDomains = budget.network?.outbound ?? [];
    for (const domain of skillPerms.network.outbound) {
      if (!isDomainAllowed(domain, budgetDomains)) {
        throw new Error(
          `Permission denied: ${skillName} requests network access to "${domain}", which is not in the project's permission budget`
        );
      }
    }
  }

  // Check filesystem read
  if (skillPerms.filesystem?.read && skillPerms.filesystem.read.length > 0) {
    const budgetPaths = budget.filesystem?.read ?? [];
    for (const p of skillPerms.filesystem.read) {
      if (!isPathAllowed(p, budgetPaths)) {
        throw new Error(
          `Permission denied: ${skillName} requests filesystem read access to "${p}", which is not in the project's permission budget`
        );
      }
    }
  }

  // Check filesystem write
  if (skillPerms.filesystem?.write && skillPerms.filesystem.write.length > 0) {
    const budgetPaths = budget.filesystem?.write ?? [];
    for (const p of skillPerms.filesystem.write) {
      if (!isPathAllowed(p, budgetPaths)) {
        throw new Error(
          `Permission denied: ${skillName} requests filesystem write access to "${p}", which is not in the project's permission budget`
        );
      }
    }
  }
}

/**
 * Check if a domain is allowed by the budget's domain list.
 * Supports wildcard matching: *.example.com matches sub.example.com
 */
export function isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
  for (const allowed of allowedDomains) {
    if (allowed === domain) return true;
    // Wildcard matching: *.example.com
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1); // .example.com
      if (domain.endsWith(suffix) || domain === allowed.slice(2)) {
        return true;
      }
      // Also match if the skill requests the same wildcard pattern
      if (domain === allowed) return true;
    }
  }
  return false;
}

/**
 * Check if a path is allowed by the budget's path list.
 * Simple subset check: skill path must match one of the budget paths.
 */
export function isPathAllowed(requestedPath: string, allowedPaths: string[]): boolean {
  for (const allowed of allowedPaths) {
    if (allowed === requestedPath) return true;
    // If budget allows ./src/** and skill requests ./src/foo, it's allowed
    if (allowed.endsWith('/**')) {
      const prefix = allowed.slice(0, -3); // ./src
      if (requestedPath.startsWith(prefix)) return true;
    }
  }
  return false;
}

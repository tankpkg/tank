import {
  checkPermissionBudget as internalCheck,
  collectPermissionViolations as internalCollect,
  isDomainAllowed,
  isPathAllowed,
  PermissionBudgetError,
  type PermissionsShape,
  type PermissionViolation
} from '@internals/helpers';
import type { Permissions } from '@internals/schemas';
import { TankPermissionError } from '../errors.js';

export { isDomainAllowed, isPathAllowed, type PermissionViolation };

// Rewrap helpers' local PermissionBudgetError as sdk-public TankPermissionError.
// Required because helpers must not depend on sdk (circular dep); see INTENT C25b.
export function checkPermissionBudget(
  budget: Permissions,
  skillPerms: Permissions | undefined,
  skillName: string
): void {
  try {
    internalCheck(budget as PermissionsShape, skillPerms as PermissionsShape | undefined, skillName);
  } catch (e) {
    if (e instanceof PermissionBudgetError) {
      throw new TankPermissionError(e.message);
    }
    throw e;
  }
}

export function collectPermissionViolations(
  budget: Permissions,
  skillPerms: Permissions | undefined,
  skillName: string
): PermissionViolation[] {
  return internalCollect(budget as PermissionsShape, skillPerms as PermissionsShape | undefined, skillName);
}

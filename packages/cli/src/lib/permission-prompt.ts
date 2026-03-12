import { confirm } from '@inquirer/prompts';
import type { Permissions } from '@internal/shared';
import { logger } from './logger.js';
import type { PermissionViolation } from './permission-checker.js';

export async function promptForPermissionExpansion(
  violations: PermissionViolation[],
  options: { yes?: boolean; isInteractive?: boolean }
): Promise<'accept' | 'decline'> {
  if (options.yes === true) return 'accept';
  if (options.isInteractive === false) return 'decline';

  logger.warn('The following permissions exceed your project budget:');
  for (const v of violations) {
    logger.warn(`  ${v.skillName}: ${v.type} → ${v.requested}`);
  }

  const accepted = await confirm({
    message: 'Would you like to add these permissions to tank.json?',
    default: true
  });

  return accepted ? 'accept' : 'decline';
}

export function mergePermissionsIntoBudget(currentBudget: Permissions, violations: PermissionViolation[]): Permissions {
  const result: Permissions = {
    ...currentBudget,
    network: currentBudget.network
      ? { ...currentBudget.network, outbound: [...(currentBudget.network.outbound ?? [])] }
      : undefined,
    filesystem: currentBudget.filesystem
      ? {
          ...currentBudget.filesystem,
          read: currentBudget.filesystem.read ? [...currentBudget.filesystem.read] : undefined,
          write: currentBudget.filesystem.write ? [...currentBudget.filesystem.write] : undefined
        }
      : undefined
  };

  for (const v of violations) {
    switch (v.type) {
      case 'filesystem.read': {
        if (!result.filesystem) result.filesystem = {};
        if (!result.filesystem.read) result.filesystem.read = [];
        if (!result.filesystem.read.includes(v.requested)) {
          result.filesystem.read.push(v.requested);
        }
        break;
      }
      case 'filesystem.write': {
        if (!result.filesystem) result.filesystem = {};
        if (!result.filesystem.write) result.filesystem.write = [];
        if (!result.filesystem.write.includes(v.requested)) {
          result.filesystem.write.push(v.requested);
        }
        break;
      }
      case 'network.outbound': {
        if (!result.network) result.network = {};
        if (!result.network.outbound) result.network.outbound = [];
        if (!result.network.outbound.includes(v.requested)) {
          result.network.outbound.push(v.requested);
        }
        break;
      }
      case 'subprocess': {
        result.subprocess = true;
        break;
      }
    }
  }

  return result;
}

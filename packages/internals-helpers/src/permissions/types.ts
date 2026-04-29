export interface PermissionViolation {
  skillName: string;
  type: 'network.outbound' | 'filesystem.read' | 'filesystem.write' | 'subprocess';
  requested: string;
}

/**
 * Thrown by checkPermissionBudget when a skill's declared permissions exceed the project budget.
 *
 * internals-helpers cannot import from @tankpkg/sdk (would invert dep graph).
 * sdk shim catches this and re-throws as TankPermissionError to preserve
 * the public sdk error API. See D7 / INTENT C25b.
 */
export class PermissionBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionBudgetError';
  }
}

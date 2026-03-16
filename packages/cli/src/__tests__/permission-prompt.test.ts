import type { Permissions } from '@internals/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn()
}));

// Types expected by the tests
interface PermissionViolation {
  skillName: string;
  type: 'network.outbound' | 'filesystem.read' | 'filesystem.write' | 'subprocess';
  requested: string;
}

describe('collectPermissionViolations', () => {
  // This function does not exist yet — tests define expected behavior
  let collectPermissionViolations: (
    budget: Permissions,
    skillPerms: Permissions | undefined,
    skillName: string
  ) => PermissionViolation[];

  beforeEach(async () => {
    // Dynamically import to allow the function to not exist yet
    try {
      const module = await import('../lib/permission-checker');
      collectPermissionViolations = module.collectPermissionViolations;
    } catch {
      // Function doesn't exist yet — tests will fail
      collectPermissionViolations = () => [];
    }
  });

  it('returns empty array when permissions are within budget', () => {
    const budget: Permissions = {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'], write: ['./output/**'] },
      subprocess: false
    };

    const skillPerms: Permissions = {
      network: { outbound: ['api.example.com'] },
      filesystem: { read: ['./src/index.ts'] },
      subprocess: false
    };

    const violations = collectPermissionViolations(budget, skillPerms, 'test-skill');
    expect(violations).toEqual([]);
  });

  it('returns violation for filesystem.read outside budget', () => {
    const budget: Permissions = {
      filesystem: { read: ['./src/**'] }
    };

    const skillPerms: Permissions = {
      filesystem: { read: ['./secrets/api-key.txt'] }
    };

    const violations = collectPermissionViolations(budget, skillPerms, 'test-skill');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      skillName: 'test-skill',
      type: 'filesystem.read',
      requested: './secrets/api-key.txt'
    });
  });

  it('returns violation for network.outbound outside budget', () => {
    const budget: Permissions = {
      network: { outbound: ['*.example.com'] }
    };

    const skillPerms: Permissions = {
      network: { outbound: ['api.malicious.com'] }
    };

    const violations = collectPermissionViolations(budget, skillPerms, 'test-skill');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      skillName: 'test-skill',
      type: 'network.outbound',
      requested: 'api.malicious.com'
    });
  });

  it('returns violation for subprocess: true when budget has false', () => {
    const budget: Permissions = {
      subprocess: false
    };

    const skillPerms: Permissions = {
      subprocess: true
    };

    const violations = collectPermissionViolations(budget, skillPerms, 'test-skill');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      skillName: 'test-skill',
      type: 'subprocess',
      requested: 'true'
    });
  });

  it('returns violation for filesystem.write outside budget', () => {
    const budget: Permissions = {
      filesystem: { write: ['./output/**'] }
    };

    const skillPerms: Permissions = {
      filesystem: { write: ['./package.json'] }
    };

    const violations = collectPermissionViolations(budget, skillPerms, 'test-skill');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      skillName: 'test-skill',
      type: 'filesystem.write',
      requested: './package.json'
    });
  });

  it('returns multiple violations at once', () => {
    const budget: Permissions = {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'] },
      subprocess: false
    };

    const skillPerms: Permissions = {
      network: { outbound: ['api.malicious.com'] },
      filesystem: { read: ['./secrets/key.txt'] },
      subprocess: true
    };

    const violations = collectPermissionViolations(budget, skillPerms, 'test-skill');
    expect(violations).toHaveLength(3);
    expect(violations).toContainEqual({
      skillName: 'test-skill',
      type: 'network.outbound',
      requested: 'api.malicious.com'
    });
    expect(violations).toContainEqual({
      skillName: 'test-skill',
      type: 'filesystem.read',
      requested: './secrets/key.txt'
    });
    expect(violations).toContainEqual({
      skillName: 'test-skill',
      type: 'subprocess',
      requested: 'true'
    });
  });

  it('returns empty array when skillPerms is undefined', () => {
    const budget: Permissions = {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'] },
      subprocess: false
    };

    const violations = collectPermissionViolations(budget, undefined, 'test-skill');
    expect(violations).toEqual([]);
  });
});

describe('promptForPermissionExpansion', () => {
  let promptForPermissionExpansion: (
    violations: PermissionViolation[],
    options: { yes?: boolean; isInteractive?: boolean }
  ) => Promise<'accept' | 'decline'>;
  let mockConfirm: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const prompts = await import('@inquirer/prompts');
    mockConfirm = prompts.confirm as ReturnType<typeof vi.fn>;
    mockConfirm.mockReset();

    try {
      const module = await import('../lib/permission-prompt');
      promptForPermissionExpansion = module.promptForPermissionExpansion;
    } catch {
      // Function doesn't exist yet
      promptForPermissionExpansion = async () => 'decline';
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "accept" when yes: true — no prompt called', async () => {
    const violations: PermissionViolation[] = [
      {
        skillName: 'test-skill',
        type: 'network.outbound',
        requested: 'api.example.com'
      }
    ];

    const result = await promptForPermissionExpansion(violations, { yes: true });
    expect(result).toBe('accept');
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('returns "decline" when isInteractive: false (CI) and yes not set', async () => {
    const violations: PermissionViolation[] = [
      {
        skillName: 'test-skill',
        type: 'network.outbound',
        requested: 'api.example.com'
      }
    ];

    const result = await promptForPermissionExpansion(violations, { isInteractive: false });
    expect(result).toBe('decline');
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('calls confirm() from @inquirer/prompts when interactive, returns "accept" if user says yes', async () => {
    mockConfirm.mockResolvedValueOnce(true);

    const violations: PermissionViolation[] = [
      {
        skillName: 'test-skill',
        type: 'network.outbound',
        requested: 'api.example.com'
      }
    ];

    const result = await promptForPermissionExpansion(violations, { isInteractive: true });
    expect(result).toBe('accept');
    expect(mockConfirm).toHaveBeenCalled();
  });

  it('calls confirm() from @inquirer/prompts when interactive, returns "decline" if user says no', async () => {
    mockConfirm.mockResolvedValueOnce(false);

    const violations: PermissionViolation[] = [
      {
        skillName: 'test-skill',
        type: 'network.outbound',
        requested: 'api.example.com'
      }
    ];

    const result = await promptForPermissionExpansion(violations, { isInteractive: true });
    expect(result).toBe('decline');
    expect(mockConfirm).toHaveBeenCalled();
  });
});

describe('mergePermissionsIntoBudget', () => {
  let mergePermissionsIntoBudget: (currentBudget: Permissions, violations: PermissionViolation[]) => Permissions;

  beforeEach(async () => {
    try {
      const module = await import('../lib/permission-prompt');
      mergePermissionsIntoBudget = module.mergePermissionsIntoBudget;
    } catch {
      // Function doesn't exist yet
      mergePermissionsIntoBudget = (budget) => budget;
    }
  });

  it('adds filesystem.read paths to existing budget', () => {
    const currentBudget: Permissions = {
      filesystem: { read: ['./src/**'] }
    };

    const violations: PermissionViolation[] = [
      {
        skillName: 'test-skill',
        type: 'filesystem.read',
        requested: './config/**'
      }
    ];

    const result = mergePermissionsIntoBudget(currentBudget, violations);
    expect(result.filesystem?.read).toContain('./src/**');
    expect(result.filesystem?.read).toContain('./config/**');
  });

  it('adds network.outbound domains to existing budget', () => {
    const currentBudget: Permissions = {
      network: { outbound: ['*.example.com'] }
    };

    const violations: PermissionViolation[] = [
      {
        skillName: 'test-skill',
        type: 'network.outbound',
        requested: 'api.github.com'
      }
    ];

    const result = mergePermissionsIntoBudget(currentBudget, violations);
    expect(result.network?.outbound).toContain('*.example.com');
    expect(result.network?.outbound).toContain('api.github.com');
  });

  it('sets subprocess to true', () => {
    const currentBudget: Permissions = {
      subprocess: false
    };

    const violations: PermissionViolation[] = [
      {
        skillName: 'test-skill',
        type: 'subprocess',
        requested: 'true'
      }
    ];

    const result = mergePermissionsIntoBudget(currentBudget, violations);
    expect(result.subprocess).toBe(true);
  });

  it('merges multiple violation types at once', () => {
    const currentBudget: Permissions = {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'], write: ['./output/**'] },
      subprocess: false
    };

    const violations: PermissionViolation[] = [
      {
        skillName: 'test-skill',
        type: 'network.outbound',
        requested: 'api.github.com'
      },
      {
        skillName: 'test-skill',
        type: 'filesystem.read',
        requested: './config/**'
      },
      {
        skillName: 'test-skill',
        type: 'subprocess',
        requested: 'true'
      }
    ];

    const result = mergePermissionsIntoBudget(currentBudget, violations);
    expect(result.network?.outbound).toContain('*.example.com');
    expect(result.network?.outbound).toContain('api.github.com');
    expect(result.filesystem?.read).toContain('./src/**');
    expect(result.filesystem?.read).toContain('./config/**');
    expect(result.filesystem?.write).toContain('./output/**');
    expect(result.subprocess).toBe(true);
  });

  it('preserves existing budget entries that are not violated', () => {
    const currentBudget: Permissions = {
      network: { outbound: ['*.example.com', 'api.github.com'] },
      filesystem: { read: ['./src/**', './config/**'], write: ['./output/**'] },
      subprocess: false
    };

    const violations: PermissionViolation[] = [
      {
        skillName: 'test-skill',
        type: 'filesystem.write',
        requested: './logs/**'
      }
    ];

    const result = mergePermissionsIntoBudget(currentBudget, violations);
    // All existing entries should still be there
    expect(result.network?.outbound).toContain('*.example.com');
    expect(result.network?.outbound).toContain('api.github.com');
    expect(result.filesystem?.read).toContain('./src/**');
    expect(result.filesystem?.read).toContain('./config/**');
    expect(result.filesystem?.write).toContain('./output/**');
    expect(result.filesystem?.write).toContain('./logs/**');
  });
});

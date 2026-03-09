/**
 * Permission escalation detection for publish-time version checks.
 *
 * When a new version is published, compares its permissions against the
 * previous version. Rejects PATCH bumps that add ANY new permissions,
 * and MINOR bumps that add dangerous permissions (network outbound,
 * subprocess).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the permissions JSONB stored in skill_versions */
export interface VersionPermissions {
  network?: {
    outbound?: string[];
  };
  filesystem?: {
    read?: string[];
    write?: string[];
  };
  subprocess?: boolean;
}

export interface PermissionEscalation {
  field: string;
  description: string;
  /** Minimum version bump required to allow this change */
  requiredBump: 'minor' | 'major';
}

export type VersionBump = 'major' | 'minor' | 'patch' | 'unknown';

// ---------------------------------------------------------------------------
// Semver helpers (no external dependency — versions are pre-validated)
// ---------------------------------------------------------------------------

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

/** Parse a validated semver string into its numeric parts. */
export function parseSemver(version: string): SemverParts | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

/** Determine the bump type between two semver versions. */
export function determineBump(oldVersion: string, newVersion: string): VersionBump {
  const oldParts = parseSemver(oldVersion);
  const newParts = parseSemver(newVersion);
  if (!oldParts || !newParts) return 'unknown';

  if (newParts.major > oldParts.major) return 'major';
  if (newParts.major < oldParts.major) return 'unknown';

  // Same major
  if (newParts.minor > oldParts.minor) return 'minor';
  if (newParts.minor < oldParts.minor) return 'unknown';

  // Same major.minor
  if (newParts.patch > oldParts.patch) return 'patch';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Permission comparison
// ---------------------------------------------------------------------------

/**
 * Detect all permission escalations between two permission objects.
 * Returns an empty array if there are no escalations.
 */
export function detectEscalations(oldPerms: VersionPermissions, newPerms: VersionPermissions): PermissionEscalation[] {
  const escalations: PermissionEscalation[] = [];

  // --- network.outbound: new domains ---
  const oldOutbound = new Set(oldPerms.network?.outbound ?? []);
  const newOutbound = newPerms.network?.outbound ?? [];
  const addedDomains = newOutbound.filter((d) => !oldOutbound.has(d));
  if (addedDomains.length > 0) {
    escalations.push({
      field: 'network.outbound',
      description: `New outbound domains added: ${addedDomains.join(', ')}`,
      requiredBump: 'major'
    });
  }

  // --- subprocess: false/undefined → true ---
  const oldSubprocess = oldPerms.subprocess === true;
  const newSubprocess = newPerms.subprocess === true;
  if (!oldSubprocess && newSubprocess) {
    escalations.push({
      field: 'subprocess',
      description: 'Subprocess permission enabled (was disabled or unset)',
      requiredBump: 'major'
    });
  }

  // --- filesystem.write: new paths ---
  const oldWrite = new Set(oldPerms.filesystem?.write ?? []);
  const newWrite = newPerms.filesystem?.write ?? [];
  const addedWritePaths = newWrite.filter((p) => !oldWrite.has(p));
  if (addedWritePaths.length > 0) {
    escalations.push({
      field: 'filesystem.write',
      description: `New filesystem write paths added: ${addedWritePaths.join(', ')}`,
      requiredBump: 'minor'
    });
  }

  // --- filesystem.read: new paths (non-dangerous, but still an escalation for PATCH) ---
  const oldRead = new Set(oldPerms.filesystem?.read ?? []);
  const newRead = newPerms.filesystem?.read ?? [];
  const addedReadPaths = newRead.filter((p) => !oldRead.has(p));
  if (addedReadPaths.length > 0) {
    escalations.push({
      field: 'filesystem.read',
      description: `New filesystem read paths added: ${addedReadPaths.join(', ')}`,
      requiredBump: 'minor'
    });
  }

  return escalations;
}

// ---------------------------------------------------------------------------
// Main check
// ---------------------------------------------------------------------------

export interface EscalationCheckResult {
  allowed: boolean;
  /** Non-empty only when allowed === false */
  violations: string[];
}

/**
 * Check whether a version publish should be allowed based on permission
 * escalation rules.
 *
 * Rules:
 * - MAJOR bump → always allowed
 * - MINOR bump → reject if dangerous escalations (network.outbound, subprocess)
 * - PATCH bump → reject if ANY new permissions are added
 * - First publish (no previous version) → always allowed
 */
export function checkPermissionEscalation(
  oldVersion: string,
  oldPerms: VersionPermissions,
  newVersion: string,
  newPerms: VersionPermissions
): EscalationCheckResult {
  const bump = determineBump(oldVersion, newVersion);

  // Major bumps allow any permission changes
  if (bump === 'major') {
    return { allowed: true, violations: [] };
  }

  const escalations = detectEscalations(oldPerms, newPerms);

  // No escalations → always allowed
  if (escalations.length === 0) {
    return { allowed: true, violations: [] };
  }

  const violations: string[] = [];

  if (bump === 'patch') {
    // PATCH: reject ALL permission escalations
    for (const esc of escalations) {
      violations.push(
        `PATCH version bump cannot add new permissions. ${esc.description}. ` +
          `Use a ${esc.requiredBump.toUpperCase()} version bump instead.`
      );
    }
  } else if (bump === 'minor') {
    // MINOR: reject only dangerous escalations (requiredBump === 'major')
    for (const esc of escalations) {
      if (esc.requiredBump === 'major') {
        violations.push(
          `MINOR version bump cannot add dangerous permissions. ${esc.description}. ` +
            `Use a MAJOR version bump instead.`
        );
      }
    }
  }
  // 'unknown' bump type — don't block (edge case, shouldn't happen with valid semver)

  return {
    allowed: violations.length === 0,
    violations
  };
}

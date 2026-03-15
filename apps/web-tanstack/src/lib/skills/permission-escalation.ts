export type VersionPermissions = Record<string, unknown>;

export interface EscalationViolation {
  field: string;
  reason: string;
}

export interface EscalationResult {
  allowed: boolean;
  violations: EscalationViolation[];
}

function parseMajor(version: string): number {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return Number.isNaN(major) ? 0 : major;
}

function isMajorBump(prevVersion: string, newVersion: string): boolean {
  return parseMajor(newVersion) > parseMajor(prevVersion);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function findNewHosts(prev: VersionPermissions, next: VersionPermissions): EscalationViolation[] {
  const prevNetwork = prev.network as Record<string, unknown> | undefined;
  const nextNetwork = next.network as Record<string, unknown> | undefined;
  if (!nextNetwork) return [];

  const prevHosts = new Set(asStringArray(prevNetwork?.outboundHosts));
  const nextHosts = asStringArray(nextNetwork.outboundHosts);
  const added = nextHosts.filter((h) => !prevHosts.has(h));

  return added.map((host) => ({
    field: 'network.outboundHosts',
    reason: `New outbound host added: ${host}`
  }));
}

function findNewWritePaths(prev: VersionPermissions, next: VersionPermissions): EscalationViolation[] {
  const prevFs = prev.filesystem as Record<string, unknown> | undefined;
  const nextFs = next.filesystem as Record<string, unknown> | undefined;
  if (!nextFs) return [];

  const prevPaths = new Set(asStringArray(prevFs?.writePaths));
  const nextPaths = asStringArray(nextFs.writePaths);
  const added = nextPaths.filter((p) => !prevPaths.has(p));

  return added.map((path) => ({
    field: 'filesystem.writePaths',
    reason: `New write path added: ${path}`
  }));
}

function checkSubprocessEscalation(prev: VersionPermissions, next: VersionPermissions): EscalationViolation[] {
  const prevSub = prev.subprocess as Record<string, unknown> | undefined;
  const nextSub = next.subprocess as Record<string, unknown> | undefined;
  if (!nextSub) return [];

  const wasEnabled = prevSub?.enabled === true;
  const nowEnabled = nextSub.enabled === true;

  if (nowEnabled && !wasEnabled) {
    return [
      {
        field: 'subprocess.enabled',
        reason: 'Subprocess execution enabled (was disabled)'
      }
    ];
  }
  return [];
}

function findNewCategories(prev: VersionPermissions, next: VersionPermissions): EscalationViolation[] {
  const prevKeys = new Set(Object.keys(prev));
  const newKeys = Object.keys(next).filter((k) => !prevKeys.has(k));

  return newKeys.map((key) => ({
    field: key,
    reason: `New permission category added: ${key}`
  }));
}

export function checkPermissionEscalation(
  prevVersion: string,
  prevPermissions: VersionPermissions,
  newVersion: string,
  newPermissions: VersionPermissions
): EscalationResult {
  if (isMajorBump(prevVersion, newVersion)) {
    return { allowed: true, violations: [] };
  }

  const violations: EscalationViolation[] = [
    ...findNewCategories(prevPermissions, newPermissions),
    ...findNewHosts(prevPermissions, newPermissions),
    ...findNewWritePaths(prevPermissions, newPermissions),
    ...checkSubprocessEscalation(prevPermissions, newPermissions)
  ];

  return { allowed: violations.length === 0, violations };
}

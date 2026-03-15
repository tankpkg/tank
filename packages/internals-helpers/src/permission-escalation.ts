export type VersionPermissions = Record<string, unknown>;

export interface EscalationViolation {
  field: string;
  reason: string;
}

export interface EscalationResult {
  allowed: boolean;
  violations: EscalationViolation[];
}

function parseParts(version: string): [number, number, number] {
  const parts = version.split('.').map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isNaN(n) ? 0 : n;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

type BumpLevel = 'major' | 'minor' | 'patch' | 'none';

function determineBump(prevVersion: string, newVersion: string): BumpLevel {
  if (!prevVersion) return 'none';
  const [pMaj, pMin] = parseParts(prevVersion);
  const [nMaj, nMin] = parseParts(newVersion);
  if (nMaj > pMaj) return 'major';
  if (nMin > pMin) return 'minor';
  return 'patch';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function findNewOutboundHosts(prev: VersionPermissions, next: VersionPermissions): EscalationViolation[] {
  const prevNetwork = prev.network as Record<string, unknown> | undefined;
  const nextNetwork = next.network as Record<string, unknown> | undefined;
  if (!nextNetwork) return [];

  const prevHosts = new Set(asStringArray(prevNetwork?.outbound));
  const nextHosts = asStringArray(nextNetwork.outbound);
  const added = nextHosts.filter((h) => !prevHosts.has(h));

  return added.map((host) => ({
    field: 'network.outbound',
    reason: `New outbound host added: ${host}. Requires MAJOR bump`
  }));
}

function findNewFilesystemPaths(
  prev: VersionPermissions,
  next: VersionPermissions
): { reads: EscalationViolation[]; writes: EscalationViolation[] } {
  const prevFs = prev.filesystem as Record<string, unknown> | undefined;
  const nextFs = next.filesystem as Record<string, unknown> | undefined;
  if (!nextFs) return { reads: [], writes: [] };

  const prevRead = new Set(asStringArray(prevFs?.read));
  const nextRead = asStringArray(nextFs.read);
  const addedRead = nextRead.filter((p) => !prevRead.has(p));

  const prevWrite = new Set(asStringArray(prevFs?.write));
  const nextWrite = asStringArray(nextFs.write);
  const addedWrite = nextWrite.filter((p) => !prevWrite.has(p));

  return {
    reads: addedRead.map((p) => ({
      field: 'filesystem.read',
      reason: `New read path added: ${p}. Requires MINOR bump`
    })),
    writes: addedWrite.map((p) => ({
      field: 'filesystem.write',
      reason: `New write path added: ${p}. Requires MINOR bump`
    }))
  };
}

function checkSubprocessEscalation(prev: VersionPermissions, next: VersionPermissions): EscalationViolation[] {
  const prevSub = prev.subprocess;
  const nextSub = next.subprocess;

  if (nextSub === true && prevSub !== true) {
    return [
      {
        field: 'subprocess',
        reason: 'Subprocess execution enabled (was disabled). Requires MAJOR bump'
      }
    ];
  }
  return [];
}

export function checkPermissionEscalation(
  prevVersion: string,
  prevPermissions: VersionPermissions,
  newVersion: string,
  newPermissions: VersionPermissions
): EscalationResult {
  const bump = determineBump(prevVersion, newVersion);

  if (bump === 'major' || bump === 'none') {
    return { allowed: true, violations: [] };
  }

  const highRisk = [
    ...findNewOutboundHosts(prevPermissions, newPermissions),
    ...checkSubprocessEscalation(prevPermissions, newPermissions)
  ];

  const fsPaths = findNewFilesystemPaths(prevPermissions, newPermissions);
  const lowRisk = [...fsPaths.reads, ...fsPaths.writes];

  if (bump === 'minor') {
    return { allowed: highRisk.length === 0, violations: highRisk };
  }

  const violations = [...highRisk, ...lowRisk];
  return { allowed: violations.length === 0, violations };
}

import { createRequire } from 'node:module';
import type { Permissions } from '@internals/schemas';

const esmRequire = createRequire(import.meta.url);

interface NativeBindings {
  verifyIntegrity(data: Buffer, expectedIntegrity: string): string;
  extractTarball(data: Buffer, dest: string): string[];
  resolveVersion(available: string[], range: string): string | null;
  isPathAllowed(requestedPath: string, allowedPaths: string[]): boolean;
  isDomainAllowed(domain: string, allowedDomains: string[]): boolean;
  checkPermissionBudget(budget: NativePermissions, skillPerms: NativePermissions, skillName: string): void;
}

interface NativePermissions {
  network?: { outbound?: string[] } | null;
  filesystem?: { read?: string[]; write?: string[] } | null;
  subprocess?: boolean | null;
}

let _native: NativeBindings | null = null;
let _nativeChecked = false;

function tryLoadNative(): NativeBindings | null {
  if (_nativeChecked) return _native;
  _nativeChecked = true;

  try {
    _native = esmRequire('@tankpkg/sdk-core') as NativeBindings;
  } catch {
    _native = null;
  }
  return _native;
}

export function hasNativeAcceleration(): boolean {
  return tryLoadNative() !== null;
}

export function nativeVerifyIntegrity(data: Buffer, expectedIntegrity: string): string | null {
  const n = tryLoadNative();
  if (!n) return null;
  return n.verifyIntegrity(data, expectedIntegrity);
}

export function nativeExtractTarball(data: Buffer, dest: string): string[] | null {
  const n = tryLoadNative();
  if (!n) return null;
  return n.extractTarball(data, dest);
}

export function nativeResolveVersion(
  available: string[],
  range: string
): { used: false } | { used: true; result: string | null } {
  const n = tryLoadNative();
  if (!n) return { used: false };
  return { used: true, result: n.resolveVersion(available, range) };
}

export function nativeIsPathAllowed(requestedPath: string, allowedPaths: string[]): boolean | null {
  const n = tryLoadNative();
  if (!n) return null;
  return n.isPathAllowed(requestedPath, allowedPaths);
}

export function nativeIsDomainAllowed(domain: string, allowedDomains: string[]): boolean | null {
  const n = tryLoadNative();
  if (!n) return null;
  return n.isDomainAllowed(domain, allowedDomains);
}

function toNativePerms(perms: Permissions): NativePermissions {
  return {
    network: perms.network ? { outbound: perms.network.outbound } : null,
    filesystem: perms.filesystem ? { read: perms.filesystem.read, write: perms.filesystem.write } : null,
    subprocess: perms.subprocess ?? null
  };
}

export function nativeCheckPermissionBudget(
  budget: Permissions,
  skillPerms: Permissions,
  skillName: string
): { used: false } | { used: true; error: string | null } {
  const n = tryLoadNative();
  if (!n) return { used: false };
  try {
    n.checkPermissionBudget(toNativePerms(budget), toNativePerms(skillPerms), skillName);
    return { used: true, error: null };
  } catch (err) {
    return { used: true, error: err instanceof Error ? err.message : String(err) };
  }
}

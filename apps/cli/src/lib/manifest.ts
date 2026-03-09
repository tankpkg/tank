import fs from 'node:fs';
import path from 'node:path';
import {
  MANIFEST_FILENAME,
  LEGACY_MANIFEST_FILENAME,
  LOCKFILE_FILENAME,
  LEGACY_LOCKFILE_FILENAME,
} from '@tank/shared';
import { logger } from './logger.js';

const warnedManifest = new Set<string>();
const warnedLockfile = new Set<string>();

export interface ResolvedFile {
  path: string;
  isLegacy: boolean;
  exists: boolean;
}

/**
 * Resolve the manifest file path with fallback priority:
 * 1. tank.json (preferred)
 * 2. skills.json (deprecated fallback)
 *
 * If both exist, prefers tank.json and warns about duplicate.
 * Returns the path even if neither exists (for write operations).
 */
export function resolveManifestPath(directory?: string): ResolvedFile {
  const dir = directory ?? process.cwd();
  const newPath = path.join(dir, MANIFEST_FILENAME);
  const legacyPath = path.join(dir, LEGACY_MANIFEST_FILENAME);

  const newExists = fs.existsSync(newPath);
  const legacyExists = fs.existsSync(legacyPath);

  if (newExists && legacyExists && !warnedManifest.has(dir)) {
    warnedManifest.add(dir);
    logger.warn(`Both ${MANIFEST_FILENAME} and ${LEGACY_MANIFEST_FILENAME} exist. Using ${MANIFEST_FILENAME}.`);
  }

  if (newExists) {
    return { path: newPath, isLegacy: false, exists: true };
  }

  if (legacyExists) {
    if (!warnedManifest.has(dir)) {
      warnedManifest.add(dir);
      logger.warn(`${LEGACY_MANIFEST_FILENAME} is deprecated — run \`tank migrate\` to switch to ${MANIFEST_FILENAME}`);
    }
    return { path: legacyPath, isLegacy: true, exists: true };
  }

  // Neither exists — return the new filename for creation
  return { path: newPath, isLegacy: false, exists: false };
}

/**
 * Resolve the lockfile path with fallback priority:
 * 1. tank.lock (preferred)
 * 2. skills.lock (deprecated fallback)
 */
export function resolveLockfilePath(directory?: string): ResolvedFile {
  const dir = directory ?? process.cwd();
  const newPath = path.join(dir, LOCKFILE_FILENAME);
  const legacyPath = path.join(dir, LEGACY_LOCKFILE_FILENAME);

  const newExists = fs.existsSync(newPath);
  const legacyExists = fs.existsSync(legacyPath);

  if (newExists && legacyExists && !warnedLockfile.has(dir)) {
    warnedLockfile.add(dir);
    logger.warn(`Both ${LOCKFILE_FILENAME} and ${LEGACY_LOCKFILE_FILENAME} exist. Using ${LOCKFILE_FILENAME}.`);
  }

  if (newExists) {
    return { path: newPath, isLegacy: false, exists: true };
  }

  if (legacyExists) {
    if (!warnedLockfile.has(dir)) {
      warnedLockfile.add(dir);
      logger.warn(`${LEGACY_LOCKFILE_FILENAME} is deprecated — run \`tank migrate\` to switch to ${LOCKFILE_FILENAME}`);
    }
    return { path: legacyPath, isLegacy: true, exists: true };
  }

  return { path: newPath, isLegacy: false, exists: false };
}

/**
 * Get the path where new manifest files should be written.
 * Always returns the new filename (tank.json).
 * If a legacy file exists but no new file, returns the legacy path
 * to avoid creating a second file during write operations.
 */
export function getManifestWritePath(directory?: string): string {
  const resolved = resolveManifestPath(directory);
  return resolved.path;
}

/**
 * Get the path where new lockfiles should be written.
 * Always returns the new filename (tank.lock).
 * If a legacy file exists but no new file, returns the legacy path
 * to avoid creating a second file during write operations.
 */
export function getLockfileWritePath(directory?: string): string {
  const resolved = resolveLockfilePath(directory);
  return resolved.path;
}

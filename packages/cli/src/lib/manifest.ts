import fs from 'node:fs';
import path from 'node:path';

import {
  LEGACY_LOCKFILE_FILENAME,
  LEGACY_MANIFEST_FILENAME,
  LOCKFILE_FILENAME,
  MANIFEST_FILENAME,
  permissionsSchema,
  type SkillsLock,
  skillsLockSchema
} from '@internals/schemas';
import { z } from 'zod';

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

/**
 * The parts of a project manifest that install reads. Read-only view: Zod moves
 * known keys first and strips unknown nested keys, so never write this back —
 * use `writeManifestSkill`, which edits the original JSON.
 */
export const projectManifestSchema = z.looseObject({
  skills: z.record(z.string(), z.string()).optional(),
  permissions: permissionsSchema.optional(),
  audit: z.object({ min_score: z.number().min(0).max(10) }).optional()
});

export type ProjectManifest = z.infer<typeof projectManifestSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
}

/** Read a JSON file and validate it against `schema`. Throws a readable error naming the file. */
export function readJsonFile<T>(filePath: string, schema: z.ZodType<T>): T {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch {
    throw new Error(`Failed to read ${path.basename(filePath)}`);
  }
  let parsed: z.ZodSafeParseResult<T>;
  try {
    parsed = schema.safeParse(JSON.parse(text));
  } catch {
    throw new Error(`Failed to parse ${path.basename(filePath)}: invalid JSON`);
  }
  if (!parsed.success) {
    throw new Error(`Invalid ${path.basename(filePath)}: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

/** Any JSON object, key order and nested fields preserved exactly. */
const rawJsonObjectSchema = z.record(z.string(), z.json());

/** Set `skills[name] = spec` in a manifest, leaving every other key, its order and nested fields untouched. */
export function writeManifestSkill(filePath: string, name: string, spec: string): void {
  const raw = readJsonFile(filePath, rawJsonObjectSchema);
  const skills = readJsonFile(filePath, projectManifestSchema).skills ?? {};
  raw.skills = { ...skills, [name]: spec };
  fs.writeFileSync(filePath, `${JSON.stringify(raw, null, 2)}\n`);
}

/** Read and validate a lockfile. Throws (naming the file) when it is unreadable or invalid. */
export function readLockfileAt(filePath: string): SkillsLock {
  return readJsonFile(filePath, skillsLockSchema);
}

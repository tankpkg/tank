import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolve, type SkillsLock, LOCKFILE_VERSION, MANIFEST_FILENAME, LOCKFILE_FILENAME } from '@tank/shared';
import { getConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { getGlobalSkillsDir } from '../lib/agents.js';
import { installCommand } from './install.js';
import { USER_AGENT } from '../version.js';
import { resolveManifestPath, resolveLockfilePath } from '../lib/manifest.js';

export interface UpdateOptions {
  name?: string;  // undefined = update all
  directory?: string;
  configDir?: string;
  global?: boolean;
  homedir?: string;
}

interface VersionInfo {
  version: string;
  integrity: string;
  auditScore: number;
  auditStatus: string;
  publishedAt: string;
}

const VERSION_CHECK_CONCURRENCY = 8;

export async function updateCommand(options: UpdateOptions): Promise<void> {
  const {
    name,
    directory = process.cwd(),
    configDir,
    global = false,
    homedir,
  } = options;

  if (global) {
    if (name) {
      await updateSingleGlobal(name, configDir, homedir);
    } else {
      await updateAllGlobal(configDir, homedir);
    }
    return;
  }

  // 1. Read manifest (tank.json or skills.json)
  const resolvedManifest = resolveManifestPath(directory);
  if (!resolvedManifest.exists) {
    throw new Error(
      `No ${MANIFEST_FILENAME} found in ${directory}. Run: tank init`,
    );
  }

  let skillsJson: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(resolvedManifest.path, 'utf-8');
    skillsJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Failed to read or parse ${path.basename(resolvedManifest.path)}`);
  }

  const skills = (skillsJson.skills ?? {}) as Record<string, string>;

  if (name) {
    // Update single skill
    await updateSingle(name, skills, directory, configDir, global, homedir);
  } else {
    // Update all skills
    await updateAll(skills, directory, configDir, global, homedir);
  }
}

function parseLockKey(key: string): { name: string; version: string } | null {
  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0) return null;
  return { name: key.slice(0, lastAt), version: key.slice(lastAt + 1) };
}

function readLockfile(lockPath: string): SkillsLock | null {
  if (!fs.existsSync(lockPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    return JSON.parse(raw) as SkillsLock;
  } catch {
    return null;
  }
}

function readLockfileStrict(lockPath: string): SkillsLock {
  if (!fs.existsSync(lockPath)) {
    throw new Error(`Global ${LOCKFILE_FILENAME} not found at ${lockPath}`);
  }
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    return JSON.parse(raw) as SkillsLock;
  } catch {
    throw new Error(`Failed to read or parse global ${LOCKFILE_FILENAME}`);
  }
}

function getGlobalLockPath(homedir?: string): string {
  const resolvedHome = homedir ?? os.homedir();
  const resolved = resolveLockfilePath(path.join(resolvedHome, '.tank'));
  return resolved.path;
}

async function fetchAvailableVersions(
  name: string,
  registry: string,
  headers: Record<string, string>,
): Promise<string[]> {
  const encodedName = encodeURIComponent(name);
  const versionsUrl = `${registry}/api/v1/skills/${encodedName}/versions`;

  let versionsRes: Response;
  try {
    versionsRes = await fetch(versionsUrl, { headers });
  } catch (err) {
    throw new Error(`Network error fetching versions for ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!versionsRes.ok) {
    if (versionsRes.status === 404) {
      throw new Error(`Skill not found in registry: ${name}`);
    }
    const body = await versionsRes.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? versionsRes.statusText);
  }

  const versionsData = await versionsRes.json() as { name: string; versions: VersionInfo[] };
  return versionsData.versions.map((v) => v.version);
}

/**
 * Deduplicate lockfile entries by skill name.
 * When multiple versions of the same skill exist in the lockfile (e.g. from
 * transitive dependencies), keeps only the highest version per skill name.
 */
function deduplicateByName(entries: string[]): Map<string, string> {
  const versionsByName = new Map<string, string[]>();
  for (const key of entries) {
    const parsed = parseLockKey(key);
    if (!parsed) continue;
    const versions = versionsByName.get(parsed.name) ?? [];
    versions.push(parsed.version);
    versionsByName.set(parsed.name, versions);
  }

  const latestByName = new Map<string, string>();
  for (const [name, versions] of versionsByName) {
    const latest = resolve('*', versions);
    if (latest) latestByName.set(name, latest);
  }

  return latestByName;
}

async function fetchVersionsBatch(
  skillNames: string[],
  registry: string,
  headers: Record<string, string>,
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();

  for (let i = 0; i < skillNames.length; i += VERSION_CHECK_CONCURRENCY) {
    const batch = skillNames.slice(i, i + VERSION_CHECK_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (name) => {
        const versions = await fetchAvailableVersions(name, registry, headers);
        return { name, versions };
      }),
    );

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.set(result.value.name, result.value.versions);
      } else {
        throw result.reason;
      }
    }
  }

  return results;
}

async function updateSingle(
  name: string,
  skills: Record<string, string>,
  directory: string,
  configDir?: string,
  global = false,
  homedir?: string,
): Promise<void> {
  const versionRange = skills[name];
  if (!versionRange) {
    throw new Error(`Skill "${name}" is not installed (not found in ${MANIFEST_FILENAME})`);
  }

  const config = getConfig(configDir);
  const requestHeaders: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (config.token) {
    requestHeaders.Authorization = `Bearer ${config.token}`;
  }

  const availableVersions = await fetchAvailableVersions(name, config.registry, requestHeaders);

  const resolved = resolve(versionRange, availableVersions);
  if (!resolved) {
    throw new Error(
      `No version of ${name} satisfies range "${versionRange}". Available: ${availableVersions.join(', ')}`,
    );
  }

  const lockPath = global
    ? getGlobalLockPath(homedir)
    : resolveLockfilePath(directory).path;
  let currentVersion: string | null = null;

  const lock = readLockfile(lockPath);
  if (lock) {
    for (const key of Object.keys(lock.skills)) {
      const parsed = parseLockKey(key);
      if (!parsed) continue;
      if (parsed.name === name) {
        currentVersion = parsed.version;
        break;
      }
    }
  }

  if (resolved === currentVersion) {
    logger.info(`Already at latest: ${name}@${resolved}`);
    return;
  }

  await installCommand({
    name,
    versionRange,
    directory,
    configDir,
    global,
    homedir,
  });

  logger.success(`Updated ${name} to ${resolved}`);
}

async function updateAll(
  skills: Record<string, string>,
  directory: string,
  configDir?: string,
  global = false,
  homedir?: string,
): Promise<void> {
  const skillEntries = Object.entries(skills);

  if (skillEntries.length === 0) {
    logger.info(`No skills defined in ${MANIFEST_FILENAME}`);
    return;
  }

  const config = getConfig(configDir);
  const requestHeaders: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (config.token) {
    requestHeaders.Authorization = `Bearer ${config.token}`;
  }

  const lockPath = global
    ? getGlobalLockPath(homedir)
    : resolveLockfilePath(directory).path;
  const lock = readLockfile(lockPath);

  const currentVersionByName = new Map<string, string>();
  if (lock) {
    for (const key of Object.keys(lock.skills)) {
      const parsed = parseLockKey(key);
      if (!parsed) continue;
      const existing = currentVersionByName.get(parsed.name);
      if (!existing) {
        currentVersionByName.set(parsed.name, parsed.version);
      } else {
        const higher = resolve('*', [existing, parsed.version]);
        if (higher) currentVersionByName.set(parsed.name, higher);
      }
    }
  }

  const skillNames = skillEntries.map(([name]) => name);
  const allVersions = await fetchVersionsBatch(skillNames, config.registry, requestHeaders);

  const toUpdate: Array<{ name: string; versionRange: string }> = [];

  for (const [name, versionRange] of skillEntries) {
    const availableVersions = allVersions.get(name);
    if (!availableVersions) continue;

    const resolved = resolve(versionRange, availableVersions);
    if (!resolved) continue;

    const currentVersion = currentVersionByName.get(name) ?? null;
    if (resolved === currentVersion) continue;

    toUpdate.push({ name, versionRange });
  }

  if (toUpdate.length === 0) {
    logger.info('All skills up to date');
    return;
  }

  for (const { name, versionRange } of toUpdate) {
    await installCommand({
      name,
      versionRange,
      directory,
      configDir,
      global,
      homedir,
    });
  }

  logger.success(`Updated ${toUpdate.length} skill${toUpdate.length === 1 ? '' : 's'}`);
}

async function updateSingleGlobal(
  name: string,
  configDir?: string,
  homedir?: string,
): Promise<void> {
  const lockPath = getGlobalLockPath(homedir);
  const lock = readLockfileStrict(lockPath);

  let currentVersion: string | null = null;
  for (const key of Object.keys(lock.skills)) {
    const parsed = parseLockKey(key);
    if (!parsed) continue;
    if (parsed.name === name) {
      currentVersion = parsed.version;
      break;
    }
  }

  if (!currentVersion) {
    throw new Error(`Skill "${name}" is not installed globally (not found in ${LOCKFILE_FILENAME})`);
  }

  const config = getConfig(configDir);
  const requestHeaders: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (config.token) {
    requestHeaders.Authorization = `Bearer ${config.token}`;
  }

  const availableVersions = await fetchAvailableVersions(name, config.registry, requestHeaders);
  const versionRange = `>=${currentVersion}`;
  const resolved = resolve(versionRange, availableVersions);

  if (!resolved) {
    throw new Error(
      `No version of ${name} satisfies range "${versionRange}". Available: ${availableVersions.join(', ')}`,
    );
  }

  if (resolved === currentVersion) {
    logger.info(`Already at latest: ${name}@${resolved}`);
    return;
  }

  await installCommand({
    name,
    versionRange,
    global: true,
    homedir,
    configDir,
  });

  logger.success(`Updated ${name} to ${resolved}`);
}

async function updateAllGlobal(
  configDir?: string,
  homedir?: string,
): Promise<void> {
  const lockPath = getGlobalLockPath(homedir);
  const lock = readLockfileStrict(lockPath);
  const entries = Object.keys(lock.skills);

  if (entries.length === 0) {
    logger.info(`No skills defined in global ${LOCKFILE_FILENAME}`);
    return;
  }

  const config = getConfig(configDir);
  const requestHeaders: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (config.token) {
    requestHeaders.Authorization = `Bearer ${config.token}`;
  }

  const latestByName = deduplicateByName(entries);
  const skillNames = Array.from(latestByName.keys());

  const allVersions = await fetchVersionsBatch(skillNames, config.registry, requestHeaders);

  const toUpdate: string[] = [];

  for (const [name, currentVersion] of latestByName) {
    const availableVersions = allVersions.get(name);
    if (!availableVersions) continue;

    const resolved = resolve('*', availableVersions);
    if (!resolved) continue;

    if (resolved === currentVersion) continue;

    toUpdate.push(name);
  }

  if (toUpdate.length === 0) {
    logger.info('All skills up to date');
    return;
  }

  for (const name of toUpdate) {
    await installCommand({
      name,
      versionRange: '*',
      global: true,
      homedir,
      configDir,
    });
  }

  logger.success(`Updated ${toUpdate.length} skill${toUpdate.length === 1 ? '' : 's'}`);
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolve, type SkillsLock, LOCKFILE_VERSION } from '@tank/shared';
import { getConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { getGlobalSkillsDir } from '../lib/agents.js';
import { installCommand } from './install.js';

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

  // 1. Read skills.json
  const skillsJsonPath = path.join(directory, 'skills.json');
  if (!fs.existsSync(skillsJsonPath)) {
    throw new Error(
      `No skills.json found in ${directory}. Run: tank init`,
    );
  }

  let skillsJson: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(skillsJsonPath, 'utf-8');
    skillsJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to read or parse skills.json');
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
    throw new Error(`Global skills.lock not found at ${lockPath}`);
  }
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    return JSON.parse(raw) as SkillsLock;
  } catch {
    throw new Error('Failed to read or parse global skills.lock');
  }
}

function getGlobalLockPath(homedir?: string): string {
  const globalSkillsDir = getGlobalSkillsDir(homedir ?? os.homedir());
  return path.join(path.dirname(globalSkillsDir), 'skills.lock');
}

async function updateSingle(
  name: string,
  skills: Record<string, string>,
  directory: string,
  configDir?: string,
  global = false,
  homedir?: string,
): Promise<void> {
  // 2. Get version range from skills.json
  const versionRange = skills[name];
  if (!versionRange) {
    throw new Error(`Skill "${name}" is not installed (not found in skills.json)`);
  }

  const config = getConfig(configDir);

  // 3. Fetch available versions from registry
  const encodedName = encodeURIComponent(name);
  const versionsUrl = `${config.registry}/api/v1/skills/${encodedName}/versions`;

  let versionsRes: Response;
  try {
    versionsRes = await fetch(versionsUrl, {
      headers: { 'User-Agent': 'tank-cli/0.1.0' },
    });
  } catch (err) {
    throw new Error(`Network error fetching versions for ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!versionsRes.ok) {
    if (versionsRes.status === 404) {
      throw new Error(`Skill not found in registry: ${name}`);
    }
    const body = await versionsRes.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? versionsRes.statusText);
  }

  const versionsData = await versionsRes.json() as { name: string; versions: VersionInfo[] };
  const availableVersions = versionsData.versions.map((v) => v.version);

  // 4. Resolve best version
  const resolved = resolve(versionRange, availableVersions);
  if (!resolved) {
    throw new Error(
      `No version of ${name} satisfies range "${versionRange}". Available: ${availableVersions.join(', ')}`,
    );
  }

  // 5. Read lockfile to find current installed version
  const lockPath = global
    ? getGlobalLockPath(homedir)
    : path.join(directory, 'skills.lock');
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

  // 6. If resolved === current, already at latest
  if (resolved === currentVersion) {
    logger.info(`Already at latest: ${name}@${resolved}`);
    return;
  }

  // 7. Install the newer version
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
    logger.info('No skills defined in skills.json');
    return;
  }

  let updatedCount = 0;

  for (const [name] of skillEntries) {
    const config = getConfig(configDir);
    const versionRange = skills[name];

    // Fetch available versions
    const encodedName = encodeURIComponent(name);
    const versionsUrl = `${config.registry}/api/v1/skills/${encodedName}/versions`;

    let versionsRes: Response;
    try {
      versionsRes = await fetch(versionsUrl, {
        headers: { 'User-Agent': 'tank-cli/0.1.0' },
      });
    } catch (err) {
      throw new Error(`Network error fetching versions for ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!versionsRes.ok) {
      throw new Error(`Failed to fetch versions for ${name}: ${versionsRes.statusText}`);
    }

    const versionsData = await versionsRes.json() as { name: string; versions: VersionInfo[] };
    const availableVersions = versionsData.versions.map((v) => v.version);

    const resolved = resolve(versionRange, availableVersions);
    if (!resolved) continue;

    // Check current version from lockfile
    const lockPath = global
      ? getGlobalLockPath(homedir)
      : path.join(directory, 'skills.lock');
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
      continue;
    }

    await installCommand({
      name,
      versionRange,
      directory,
      configDir,
      global,
      homedir,
    });
    updatedCount++;
  }

  if (updatedCount === 0) {
    logger.info('All skills up to date');
  } else {
    logger.success(`Updated ${updatedCount} skill${updatedCount === 1 ? '' : 's'}`);
  }
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
    throw new Error(`Skill "${name}" is not installed globally (not found in skills.lock)`);
  }

  const config = getConfig(configDir);
  const encodedName = encodeURIComponent(name);
  const versionsUrl = `${config.registry}/api/v1/skills/${encodedName}/versions`;

  let versionsRes: Response;
  try {
    versionsRes = await fetch(versionsUrl, {
      headers: { 'User-Agent': 'tank-cli/0.1.0' },
    });
  } catch (err) {
    throw new Error(`Network error fetching versions for ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!versionsRes.ok) {
    if (versionsRes.status === 404) {
      throw new Error(`Skill not found in registry: ${name}`);
    }
    const body = await versionsRes.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? versionsRes.statusText);
  }

  const versionsData = await versionsRes.json() as { name: string; versions: VersionInfo[] };
  const availableVersions = versionsData.versions.map((v) => v.version);
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
    logger.info('No skills defined in global skills.lock');
    return;
  }

  let updatedCount = 0;

  for (const key of entries) {
    const parsed = parseLockKey(key);
    if (!parsed) continue;
    const { name } = parsed;
    const config = getConfig(configDir);
    const versionRange = '*';

    const encodedName = encodeURIComponent(name);
    const versionsUrl = `${config.registry}/api/v1/skills/${encodedName}/versions`;

    let versionsRes: Response;
    try {
      versionsRes = await fetch(versionsUrl, {
        headers: { 'User-Agent': 'tank-cli/0.1.0' },
      });
    } catch (err) {
      throw new Error(`Network error fetching versions for ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!versionsRes.ok) {
      throw new Error(`Failed to fetch versions for ${name}: ${versionsRes.statusText}`);
    }

    const versionsData = await versionsRes.json() as { name: string; versions: VersionInfo[] };
    const availableVersions = versionsData.versions.map((v) => v.version);
    const resolved = resolve(versionRange, availableVersions);
    if (!resolved) continue;

    const currentVersion = parsed.version;
    if (resolved === currentVersion) {
      continue;
    }

    await installCommand({
      name,
      versionRange,
      global: true,
      homedir,
      configDir,
    });
    updatedCount++;
  }

  if (updatedCount === 0) {
    logger.info('All skills up to date');
  } else {
    logger.success(`Updated ${updatedCount} skill${updatedCount === 1 ? '' : 's'}`);
  }
}

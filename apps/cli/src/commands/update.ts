import fs from 'node:fs';
import path from 'node:path';
import { resolve, type SkillsLock, LOCKFILE_VERSION } from '@tank/shared';
import { getConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { installCommand } from './install.js';

export interface UpdateOptions {
  name?: string;  // undefined = update all
  directory?: string;
  configDir?: string;
}

interface VersionInfo {
  version: string;
  integrity: string;
  auditScore: number;
  auditStatus: string;
  publishedAt: string;
}

export async function updateCommand(options: UpdateOptions): Promise<void> {
  const { name, directory = process.cwd(), configDir } = options;

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
    await updateSingle(name, skills, directory, configDir);
  } else {
    // Update all skills
    await updateAll(skills, directory, configDir);
  }
}

async function updateSingle(
  name: string,
  skills: Record<string, string>,
  directory: string,
  configDir?: string,
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
  const lockPath = path.join(directory, 'skills.lock');
  let currentVersion: string | null = null;

  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, 'utf-8');
      const lock = JSON.parse(raw) as SkillsLock;

      // Find the current installed version for this skill
      for (const key of Object.keys(lock.skills)) {
        const lastAt = key.lastIndexOf('@');
        if (lastAt <= 0) continue;
        const keyName = key.slice(0, lastAt);
        const keyVersion = key.slice(lastAt + 1);
        if (keyName === name) {
          currentVersion = keyVersion;
          break;
        }
      }
    } catch {
      // Corrupt lockfile — treat as no current version
    }
  }

  // 6. If resolved === current, already at latest
  if (resolved === currentVersion) {
    logger.info(`Already at latest: ${name}@${resolved}`);
    return;
  }

  // 7. Install the newer version
  await installCommand({ name, versionRange, directory, configDir });

  logger.success(`Updated ${name} to ${resolved}`);
}

async function updateAll(
  skills: Record<string, string>,
  directory: string,
  configDir?: string,
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
    const lockPath = path.join(directory, 'skills.lock');
    let currentVersion: string | null = null;

    if (fs.existsSync(lockPath)) {
      try {
        const raw = fs.readFileSync(lockPath, 'utf-8');
        const lock = JSON.parse(raw) as SkillsLock;

        for (const key of Object.keys(lock.skills)) {
          const lastAt = key.lastIndexOf('@');
          if (lastAt <= 0) continue;
          const keyName = key.slice(0, lastAt);
          const keyVersion = key.slice(lastAt + 1);
          if (keyName === name) {
            currentVersion = keyVersion;
            break;
          }
        }
      } catch {
        // Corrupt lockfile
      }
    }

    if (resolved === currentVersion) {
      continue;
    }

    await installCommand({ name, versionRange, directory, configDir });
    updatedCount++;
  }

  if (updatedCount === 0) {
    logger.info('All skills up to date');
  } else {
    logger.success(`Updated ${updatedCount} skill${updatedCount === 1 ? '' : 's'}`);
  }
}

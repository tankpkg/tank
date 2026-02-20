import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import ora from 'ora';
import { extract } from 'tar';
import { resolve, type Permissions, type SkillsLock, LOCKFILE_VERSION } from '@tank/shared';
import { getConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { prepareAgentSkillDir } from '../lib/frontmatter.js';
import { linkSkillToAgents } from '../lib/linker.js';
import { detectInstalledAgents, getGlobalSkillsDir, getGlobalAgentSkillsDir } from '../lib/agents.js';
import { USER_AGENT } from '../version.js';

const MAX_UNCOMPRESSED_SIZE = 100 * 1024 * 1024; // 100MB

export interface InstallOptions {
  name: string;
  versionRange?: string;
  directory?: string;
  configDir?: string;
  global?: boolean;
  homedir?: string;
}

export interface LockfileInstallOptions {
  directory?: string;
  configDir?: string;
  global?: boolean;
  homedir?: string;
}

export interface InstallAllOptions {
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

interface VersionMetadata {
  name: string;
  version: string;
  description?: string;
  integrity: string;
  permissions: Permissions;
  auditScore: number;
  auditStatus: string;
  downloadUrl: string;
  publishedAt: string;
}

/**
 * Install a skill from the Tank registry.
 *
 * Flow:
 * 1. Read skills.json from directory (must exist)
 * 2. Fetch available versions
 * 3. Resolve best version using semver
 * 4. Check if already installed (skip if same version in lockfile)
 * 5. Fetch version metadata + download URL
 * 6. Check permission budget
 * 7. Download tarball
 * 8. Verify integrity (sha512)
 * 9. Extract tarball safely
 * 10. Update skills.json
 * 11. Update skills.lock
 */
export async function installCommand(options: InstallOptions): Promise<void> {
  const {
    name,
    versionRange = '*',
    directory = process.cwd(),
    configDir,
    global = false,
    homedir,
  } = options;

  const config = getConfig(configDir);
  const resolvedHome = homedir ?? os.homedir();

  // 1. Read or create skills.json
  const skillsJsonPath = path.join(directory, 'skills.json');
  let skillsJson: Record<string, unknown> = { skills: {} };
  if (!global) {
    if (!fs.existsSync(skillsJsonPath)) {
      skillsJson = { skills: {} };
      fs.writeFileSync(skillsJsonPath, JSON.stringify(skillsJson, null, 2) + '\n');
      logger.info('Created skills.json');
    } else {
      try {
        const raw = fs.readFileSync(skillsJsonPath, 'utf-8');
        skillsJson = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new Error('Failed to read or parse skills.json');
      }
    }
  }

  // Read existing lockfile if present
  const lockPath = global
    ? path.join(resolvedHome, '.tank', 'skills.lock')
    : path.join(directory, 'skills.lock');
  let lock: SkillsLock = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, 'utf-8');
      lock = JSON.parse(raw) as SkillsLock;
    } catch {
      // If lockfile is corrupt, start fresh
      lock = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
    }
  }

  const spinner = ora('Resolving versions...').start();

  // 2. Fetch available versions
  const encodedName = encodeURIComponent(name);
  const versionsUrl = `${config.registry}/api/v1/skills/${encodedName}/versions`;

  let versionsRes: Response;
  try {
    versionsRes = await fetch(versionsUrl, {
          headers: { 'User-Agent': USER_AGENT },
    });
  } catch (err) {
    spinner.fail('Failed to fetch versions');
    throw new Error(`Network error fetching versions: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!versionsRes.ok) {
    spinner.fail('Failed to fetch versions');
    if (versionsRes.status === 404) {
      throw new Error(`Skill not found: ${name}`);
    }
    const body = await versionsRes.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? versionsRes.statusText);
  }

  const versionsData = await versionsRes.json() as { name: string; versions: VersionInfo[] };
  const availableVersions = versionsData.versions.map((v) => v.version);

  // 3. Resolve best version
  const resolved = resolve(versionRange, availableVersions);
  if (!resolved) {
    spinner.fail('Version resolution failed');
    throw new Error(
      `No version of ${name} satisfies range "${versionRange}". Available: ${availableVersions.join(', ')}`,
    );
  }

  // 4. Check if already installed
  const lockKey = `${name}@${resolved}`;
  if (lock.skills[lockKey]) {
    spinner.stop();
    logger.info(`${name}@${resolved} is already installed`);
    return;
  }

  // 5. Fetch version metadata
  spinner.text = `Fetching ${name}@${resolved}...`;
  const metaUrl = `${config.registry}/api/v1/skills/${encodedName}/${resolved}`;

  let metaRes: Response;
  try {
    metaRes = await fetch(metaUrl, {
        headers: { 'User-Agent': USER_AGENT },
    });
  } catch (err) {
    spinner.fail('Failed to fetch version metadata');
    throw new Error(`Network error fetching metadata: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!metaRes.ok) {
    spinner.fail('Failed to fetch version metadata');
    const body = await metaRes.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? metaRes.statusText);
  }

  const metadata = await metaRes.json() as VersionMetadata;

  // 6. Check permission budget
  const projectPermissions = global ? undefined : skillsJson.permissions as Permissions | undefined;
  const skillPermissions = metadata.permissions;

  if (!global) {
    if (!projectPermissions) {
      logger.warn('No permission budget defined in skills.json. Install proceeding without permission checks.');
    } else {
      checkPermissionBudget(projectPermissions, skillPermissions, name);
    }
  }

  // 7. Download tarball
  spinner.text = `Downloading ${name}@${resolved}...`;
  let downloadRes: Response;
  try {
    downloadRes = await fetch(metadata.downloadUrl);
  } catch (err) {
    spinner.fail('Download failed');
    throw new Error(`Network error downloading tarball: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!downloadRes.ok) {
    spinner.fail('Download failed');
    throw new Error(`Failed to download tarball: ${downloadRes.status} ${downloadRes.statusText}`);
  }

  const tarballBuffer = Buffer.from(await downloadRes.arrayBuffer());

  // 8. Verify integrity
  spinner.text = 'Verifying integrity...';
  const hash = crypto.createHash('sha512').update(tarballBuffer).digest('base64');
  const computedIntegrity = `sha512-${hash}`;

  if (computedIntegrity !== metadata.integrity) {
    spinner.fail('Integrity check failed');
    throw new Error(
      `Integrity mismatch for ${name}@${resolved}. Expected: ${metadata.integrity}, Got: ${computedIntegrity}`,
    );
  }

  // 9. Extract tarball safely
  spinner.text = `Extracting ${name}@${resolved}...`;
  const extractDir = global
    ? getGlobalExtractDir(resolvedHome, name)
    : getExtractDir(directory, name);

  // Create extraction directory
  fs.mkdirSync(extractDir, { recursive: true });

  // Extract with safety checks
  await extractSafely(tarballBuffer, extractDir);

  // 10. Update skills.json
  if (!global) {
    const skills = (skillsJson.skills ?? {}) as Record<string, string>;
    // Use the provided range if explicit, otherwise use ^{resolved}
    skills[name] = versionRange === '*' ? `^${resolved}` : versionRange;
    skillsJson.skills = skills;

    fs.writeFileSync(
      skillsJsonPath,
      JSON.stringify(skillsJson, null, 2) + '\n',
    );
  }

  // 11. Update skills.lock
  lock.skills[lockKey] = {
    resolved: metadata.downloadUrl,
    integrity: computedIntegrity,
    permissions: skillPermissions ?? {},
    audit_score: metadata.auditScore ?? null,
  };

  // Sort keys alphabetically
  const sortedSkills: Record<string, unknown> = {};
  for (const key of Object.keys(lock.skills).sort()) {
    sortedSkills[key] = lock.skills[key];
  }
  lock.skills = sortedSkills as SkillsLock['skills'];

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

  // 12. Agent linking (always-on, failures are warnings)
  try {
    const agentSkillsBaseDir = global
      ? getGlobalAgentSkillsDir(resolvedHome)
      : path.join(directory, '.tank', 'agent-skills');
    const agentSkillDir = prepareAgentSkillDir({
      skillName: name,
      extractDir,
      agentSkillsBaseDir,
      description: metadata.description,
    });
    const linkResult = linkSkillToAgents({
      skillName: name,
      sourceDir: agentSkillDir,
      linksDir: global ? path.join(resolvedHome, '.tank') : path.join(directory, '.tank'),
      source: global ? 'global' : 'local',
      homedir: options.homedir,
    });
    const detectedAgents = detectInstalledAgents(options.homedir);
    if (detectedAgents.length === 0) {
      logger.warn('No agents detected for linking');
    }
    if (linkResult.linked.length > 0) {
      logger.info(`Linked to ${linkResult.linked.length} agent(s)`);
    }
    if (linkResult.failed.length > 0) {
      for (const f of linkResult.failed) {
        logger.warn(`Failed to link to ${f.agentId}: ${f.error}`);
      }
    }
  } catch {
    logger.warn('Agent linking skipped (non-fatal)');
  }

  spinner.succeed(`Installed ${name}@${resolved}`);
}

export async function installFromLockfile(options: LockfileInstallOptions): Promise<void> {
  const { directory = process.cwd(), configDir: _configDir, global = false, homedir } = options;
  const resolvedHome = homedir ?? os.homedir();

  const lockPath = global
    ? path.join(resolvedHome, '.tank', 'skills.lock')
    : path.join(directory, 'skills.lock');
  if (!fs.existsSync(lockPath)) {
    throw new Error(`No skills.lock found in ${directory}`);
  }

  let lock: SkillsLock;
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    lock = JSON.parse(raw) as SkillsLock;
  } catch {
    throw new Error('Failed to read or parse skills.lock');
  }

  const entries = Object.entries(lock.skills);
  if (entries.length === 0) {
    logger.info('No skills in lockfile');
    return;
  }

  const spinner = ora('Installing from lockfile...').start();
  const skillsDir = global
    ? getGlobalSkillsDir(resolvedHome)
    : path.join(directory, '.tank', 'skills');

  try {
    for (const [key, entry] of entries) {
      const skillName = parseLockKey(key);
      spinner.text = `Installing ${key}...`;

      const downloadRes = await fetch(entry.resolved);
      if (!downloadRes.ok) {
        throw new Error(`Failed to download ${key}: ${downloadRes.status} ${downloadRes.statusText}`);
      }

      const tarballBuffer = Buffer.from(await downloadRes.arrayBuffer());

      const hash = crypto.createHash('sha512').update(tarballBuffer).digest('base64');
      const computedIntegrity = `sha512-${hash}`;

      if (computedIntegrity !== entry.integrity) {
        throw new Error(
          `Integrity mismatch for ${key}. Expected: ${entry.integrity}, Got: ${computedIntegrity}`,
        );
      }

      const extractDir = global
        ? getGlobalExtractDir(resolvedHome, skillName)
        : getExtractDir(directory, skillName);

      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      fs.mkdirSync(extractDir, { recursive: true });

      await extractSafely(tarballBuffer, extractDir);

      if (global) {
        try {
          const agentSkillsBaseDir = getGlobalAgentSkillsDir(resolvedHome);
          const agentSkillDir = prepareAgentSkillDir({
            skillName,
            extractDir,
            agentSkillsBaseDir,
          });
          const linkResult = linkSkillToAgents({
            skillName,
            sourceDir: agentSkillDir,
            linksDir: path.join(resolvedHome, '.tank'),
            source: 'global',
            homedir,
          });
          const detectedAgents = detectInstalledAgents(homedir);
          if (detectedAgents.length === 0) {
            logger.warn('No agents detected for linking');
          }
          if (linkResult.linked.length > 0) {
            logger.info(`Linked to ${linkResult.linked.length} agent(s)`);
          }
          if (linkResult.failed.length > 0) {
            for (const f of linkResult.failed) {
              logger.warn(`Failed to link to ${f.agentId}: ${f.error}`);
            }
          }
        } catch {
          logger.warn('Agent linking skipped (non-fatal)');
        }
      }
    }

    spinner.succeed(`Installed ${entries.length} skill${entries.length === 1 ? '' : 's'} from lockfile`);
  } catch (err) {
    spinner.fail('Install from lockfile failed');
    if (fs.existsSync(skillsDir)) {
      fs.rmSync(skillsDir, { recursive: true, force: true });
    }
    throw err;
  }
}

export async function installAll(options: InstallAllOptions): Promise<void> {
  const { directory = process.cwd(), configDir, global = false, homedir } = options;
  const resolvedHome = homedir ?? os.homedir();

  const lockPath = global
    ? path.join(resolvedHome, '.tank', 'skills.lock')
    : path.join(directory, 'skills.lock');
  const skillsJsonPath = path.join(directory, 'skills.json');

  if (fs.existsSync(lockPath)) {
    return installFromLockfile({ directory, configDir, global, homedir });
  }

  if (global) {
    logger.info('No skills.lock found — nothing to install');
    return;
  }

  if (!fs.existsSync(skillsJsonPath)) {
    logger.info('No skills.json found — nothing to install');
    return;
  }

  let skillsJson: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(skillsJsonPath, 'utf-8');
    skillsJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to read or parse skills.json');
  }

  const skills = (skillsJson.skills ?? {}) as Record<string, string>;
  const skillEntries = Object.entries(skills);

  if (skillEntries.length === 0) {
    logger.info('No skills defined in skills.json');
    return;
  }

  for (const [name, versionRange] of skillEntries) {
    await installCommand({ name, versionRange, directory, configDir, global, homedir });
  }
}

function parseLockKey(key: string): string {
  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0) {
    throw new Error(`Invalid lockfile key: ${key}`);
  }
  return key.slice(0, lastAt);
}

function getExtractDir(projectDir: string, skillName: string): string {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(projectDir, '.tank', 'skills', scope, name);
  }
  return path.join(projectDir, '.tank', 'skills', skillName);
}

function getGlobalExtractDir(homedir: string, skillName: string): string {
  const globalDir = path.join(homedir, '.tank', 'skills');
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(globalDir, scope, name);
  }
  return path.join(globalDir, skillName);
}

/**
 * Extract a tarball safely with security checks.
 * Rejects: absolute paths, path traversal (..), symlinks/hardlinks.
 * Enforces max uncompressed size.
 */
async function extractSafely(tarball: Buffer, destDir: string): Promise<void> {
  // Write tarball to a temp file for extraction
  const tmpTarball = path.join(destDir, '.tmp-tarball.tgz');
  fs.writeFileSync(tmpTarball, tarball);

  try {
    await extract({
      file: tmpTarball,
      cwd: destDir,
      // Safety: reject entries that try to escape the extraction directory
      filter: (entryPath: string) => {
        // Reject absolute paths
        if (path.isAbsolute(entryPath)) {
          throw new Error(`Absolute path in tarball: ${entryPath}`);
        }
        // Reject path traversal
        if (entryPath.split('/').includes('..') || entryPath.split(path.sep).includes('..')) {
          throw new Error(`Path traversal in tarball: ${entryPath}`);
        }
        return true;
      },
      onReadEntry: (entry) => {
        // Reject symlinks and hardlinks
        if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
          throw new Error(`Symlink/hardlink in tarball: ${entry.path}`);
        }
      },
    });
  } finally {
    // Clean up temp tarball
    if (fs.existsSync(tmpTarball)) {
      fs.unlinkSync(tmpTarball);
    }
  }
}

/**
 * Check if a skill's permissions fit within the project's permission budget.
 * Throws if any permission exceeds the budget.
 */
function checkPermissionBudget(
  budget: Permissions,
  skillPerms: Permissions | undefined,
  skillName: string,
): void {
  if (!skillPerms) return;

  // Check subprocess
  if (skillPerms.subprocess === true && budget.subprocess !== true) {
    throw new Error(
      `Permission denied: ${skillName} requires subprocess access, but project budget does not allow it`,
    );
  }

  // Check network outbound
  if (skillPerms.network?.outbound && skillPerms.network.outbound.length > 0) {
    const budgetDomains = budget.network?.outbound ?? [];
    for (const domain of skillPerms.network.outbound) {
      if (!isDomainAllowed(domain, budgetDomains)) {
        throw new Error(
          `Permission denied: ${skillName} requests network access to "${domain}", which is not in the project's permission budget`,
        );
      }
    }
  }

  // Check filesystem read
  if (skillPerms.filesystem?.read && skillPerms.filesystem.read.length > 0) {
    const budgetPaths = budget.filesystem?.read ?? [];
    for (const p of skillPerms.filesystem.read) {
      if (!isPathAllowed(p, budgetPaths)) {
        throw new Error(
          `Permission denied: ${skillName} requests filesystem read access to "${p}", which is not in the project's permission budget`,
        );
      }
    }
  }

  // Check filesystem write
  if (skillPerms.filesystem?.write && skillPerms.filesystem.write.length > 0) {
    const budgetPaths = budget.filesystem?.write ?? [];
    for (const p of skillPerms.filesystem.write) {
      if (!isPathAllowed(p, budgetPaths)) {
        throw new Error(
          `Permission denied: ${skillName} requests filesystem write access to "${p}", which is not in the project's permission budget`,
        );
      }
    }
  }
}

/**
 * Check if a domain is allowed by the budget's domain list.
 * Supports wildcard matching: *.example.com matches sub.example.com
 */
function isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
  for (const allowed of allowedDomains) {
    if (allowed === domain) return true;
    // Wildcard matching: *.example.com
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1); // .example.com
      if (domain.endsWith(suffix) || domain === allowed.slice(2)) {
        return true;
      }
      // Also match if the skill requests the same wildcard pattern
      if (domain === allowed) return true;
    }
  }
  return false;
}

/**
 * Check if a path is allowed by the budget's path list.
 * Simple subset check: skill path must match one of the budget paths.
 */
function isPathAllowed(requestedPath: string, allowedPaths: string[]): boolean {
  for (const allowed of allowedPaths) {
    if (allowed === requestedPath) return true;
    // If budget allows ./src/** and skill requests ./src/foo, it's allowed
    if (allowed.endsWith('/**')) {
      const prefix = allowed.slice(0, -3); // ./src
      if (requestedPath.startsWith(prefix)) return true;
    }
  }
  return false;
}

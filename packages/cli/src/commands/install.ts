import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolve } from '@internals/helpers';
import {
  LOCKFILE_FILENAME,
  LOCKFILE_VERSION,
  MANIFEST_FILENAME,
  type Permissions,
  type SkillsLock
} from '@internals/schemas';
import ora from 'ora';

import { detectInstalledAgents, getGlobalAgentSkillsDir, getGlobalSkillsDir } from '~/lib/agents.js';
import { getConfig } from '~/lib/config.js';
import {
  buildSkillKey,
  type RegistryFetcher,
  type RegistrySkillMeta,
  type RegistryVersionInfo,
  type ResolvedNode,
  resolveDependencyTree
} from '~/lib/dependency-resolver.js';
import { prepareAgentSkillDir } from '~/lib/frontmatter.js';
import {
  downloadAllParallel,
  extractSafely,
  getExtractDir,
  getGlobalExtractDir,
  getResolvedNodesInOrder,
  parseLockKey,
  parseVersionFromLockKey,
  readExtractedDependencies,
  verifyExtractedDependencies,
  writeLockfileWithResolvedGraph
} from '~/lib/install-pipeline.js';
import { linkSkillToAgents } from '~/lib/linker.js';
import { logger } from '~/lib/logger.js';
import { resolveLockfilePath, resolveManifestPath } from '~/lib/manifest.js';
import { checkPermissionBudget } from '~/lib/permission-checker.js';
import { USER_AGENT } from '~/version.js';

export interface InstallOptions {
  name: string;
  versionRange?: string;
  directory?: string;
  configDir?: string;
  global?: boolean;
  homedir?: string;
  isTransitive?: boolean;
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

interface ExecuteInstallPipelineOptions {
  directory: string;
  configDir?: string;
  global: boolean;
  homedir?: string;
  resolvedHome: string;
  lock: SkillsLock;
  lockPath: string;
  resolvedNodes: ResolvedNode[];
  nodesToInstall: ResolvedNode[];
  rootSkillNames: string[];
  projectPermissions?: Permissions;
  auditMinScore?: number;
  spinner: ReturnType<typeof ora>;
}

function createRegistryFetcher(registry: string, headers: Record<string, string>): RegistryFetcher {
  const versionsCache = new Map<string, RegistryVersionInfo[]>();
  const metadataCache = new Map<string, RegistrySkillMeta>();

  return {
    async fetchVersions(name: string): Promise<RegistryVersionInfo[]> {
      const cached = versionsCache.get(name);
      if (cached) {
        return cached;
      }

      const encoded = encodeURIComponent(name);
      let res: Response;
      try {
        res = await fetch(`${registry}/api/v1/skills/${encoded}/versions`, { headers });
      } catch (err) {
        throw new Error(`Network error fetching versions: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!res.ok) {
        if (res.status === 403) throw new Error('Token lacks required scope: skills:read');
        if (res.status === 404) throw new Error(`Skill not found or no access: ${name}`);
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? res.statusText);
      }
      const data = (await res.json()) as { name: string; versions: RegistryVersionInfo[] };
      versionsCache.set(name, data.versions);
      return data.versions;
    },
    async fetchMetadata(name: string, version: string): Promise<RegistrySkillMeta> {
      const cacheKey = buildSkillKey(name, version);
      const cached = metadataCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const encoded = encodeURIComponent(name);
      let res: Response;
      try {
        res = await fetch(`${registry}/api/v1/skills/${encoded}/${version}`, { headers });
      } catch (err) {
        throw new Error(`Network error fetching metadata: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!res.ok) {
        if (res.status === 403) throw new Error('Token lacks required scope: skills:read');
        if (res.status === 404) throw new Error(`Skill not found or no access: ${name}@${version}`);
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? res.statusText);
      }

      const data = (await res.json()) as RegistrySkillMeta;
      const normalized: RegistrySkillMeta = {
        ...data,
        dependencies: data.dependencies ?? {}
      };
      metadataCache.set(cacheKey, normalized);
      return normalized;
    }
  };
}

function readSkillsJson(skillsJsonPath: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(skillsJsonPath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Failed to read or parse ${path.basename(skillsJsonPath)}`);
  }
}

function readOrCreateSkillsJson(skillsJsonPath: string): Record<string, unknown> {
  if (!fs.existsSync(skillsJsonPath)) {
    const skillsJson: Record<string, unknown> = { skills: {} };
    fs.writeFileSync(skillsJsonPath, `${JSON.stringify(skillsJson, null, 2)}\n`);
    logger.info(`Created ${MANIFEST_FILENAME}`);
    return skillsJson;
  }

  return readSkillsJson(skillsJsonPath);
}

function readLockOrFresh(lockPath: string): SkillsLock {
  if (!fs.existsSync(lockPath)) {
    return { lockfileVersion: LOCKFILE_VERSION, skills: {} };
  }

  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    return JSON.parse(raw) as SkillsLock;
  } catch {
    return { lockfileVersion: LOCKFILE_VERSION, skills: {} };
  }
}

function buildLockedVersionByName(lock: SkillsLock): Map<string, string> {
  const lockedVersionByName = new Map<string, string>();
  for (const key of Object.keys(lock.skills)) {
    lockedVersionByName.set(parseLockKey(key), parseVersionFromLockKey(key));
  }
  return lockedVersionByName;
}

function createExtractDirResolver(
  directory: string,
  global: boolean,
  resolvedHome: string
): (skillName: string) => string {
  return (skillName: string): string =>
    global ? getGlobalExtractDir(resolvedHome, skillName) : getExtractDir(directory, skillName);
}

function validateResolvedNodes(
  resolvedNodes: ResolvedNode[],
  projectPermissions: Permissions | undefined,
  auditMinScore: number | undefined
): void {
  if (!projectPermissions) {
    logger.warn(`No permission budget defined in ${MANIFEST_FILENAME}. Install proceeding without permission checks.`);
  }

  for (const node of resolvedNodes) {
    if (projectPermissions) {
      checkPermissionBudget(projectPermissions, node.meta.permissions as Permissions, node.name);
    }

    if (auditMinScore !== undefined) {
      if (node.meta.auditScore === null || node.meta.auditScore === undefined) {
        logger.warn(`Audit score not yet available for ${node.name}. Install proceeding without audit score check.`);
      } else if (node.meta.auditScore < auditMinScore) {
        throw new Error(
          `Audit score ${node.meta.auditScore} for ${node.name} is below minimum threshold ${auditMinScore} defined in ${MANIFEST_FILENAME}`
        );
      }
    }
  }
}

async function runLegacyFallback(options: {
  rootSkillNames: string[];
  resolvedNodeByName: Map<string, ResolvedNode>;
  extractDirForSkill: (skillName: string) => string;
  directory: string;
  configDir?: string;
  global: boolean;
  homedir?: string;
}): Promise<void> {
  const { rootSkillNames, resolvedNodeByName, extractDirForSkill, directory, configDir, global, homedir } = options;

  for (const skillName of rootSkillNames) {
    const node = resolvedNodeByName.get(skillName);
    if (!node || Object.keys(node.meta.dependencies).length > 0) {
      continue;
    }

    const extractedDeps = readExtractedDependencies(extractDirForSkill(skillName));
    for (const [depName, depRange] of Object.entries(extractedDeps)) {
      if (depName === skillName) {
        continue;
      }

      await installCommand({
        name: depName,
        versionRange: depRange,
        directory,
        configDir,
        global,
        homedir,
        isTransitive: true
      });
    }
  }
}

function linkInstalledRoots(options: {
  rootSkillNames: string[];
  resolvedNodeByName: Map<string, ResolvedNode>;
  extractDirForSkill: (skillName: string) => string;
  directory: string;
  global: boolean;
  resolvedHome: string;
  homedir?: string;
}): void {
  const { rootSkillNames, resolvedNodeByName, extractDirForSkill, directory, global, resolvedHome, homedir } = options;

  const agentSkillsBaseDir = global
    ? getGlobalAgentSkillsDir(resolvedHome)
    : path.join(directory, '.tank', 'agent-skills');
  const linksDir = global ? path.join(resolvedHome, '.tank') : path.join(directory, '.tank');

  for (const skillName of rootSkillNames) {
    try {
      const node = resolvedNodeByName.get(skillName);
      if (!node) {
        continue;
      }

      const agentSkillDir = prepareAgentSkillDir({
        skillName,
        extractDir: extractDirForSkill(skillName),
        agentSkillsBaseDir,
        description: node.meta.description
      });
      const linkResult = linkSkillToAgents({
        skillName,
        sourceDir: agentSkillDir,
        linksDir,
        source: global ? 'global' : 'local',
        homedir
      });

      if (linkResult.linked.length > 0) {
        logger.info(`Linked to ${linkResult.linked.length} agent(s)`);
      }
      if (linkResult.failed.length > 0) {
        for (const failedLink of linkResult.failed) {
          logger.warn(`Failed to link to ${failedLink.agentId}: ${failedLink.error}`);
        }
      }
    } catch {
      if (rootSkillNames.length === 1) {
        logger.warn('Agent linking skipped (non-fatal)');
      } else {
        logger.warn(`Agent linking skipped for ${skillName} (non-fatal)`);
      }
    }
  }

  const detectedAgents = detectInstalledAgents(homedir);
  if (detectedAgents.length === 0) {
    logger.warn('No agents detected for linking');
  }
}

async function executeInstallPipeline(options: ExecuteInstallPipelineOptions): Promise<SkillsLock> {
  const {
    directory,
    configDir,
    global,
    homedir,
    resolvedHome,
    lock,
    lockPath,
    resolvedNodes,
    nodesToInstall,
    rootSkillNames,
    projectPermissions,
    auditMinScore,
    spinner
  } = options;

  if (!global) {
    validateResolvedNodes(resolvedNodes, projectPermissions, auditMinScore);
  }

  const extractDirForSkill = createExtractDirResolver(directory, global, resolvedHome);
  const resolvedNodeByName = new Map(resolvedNodes.map((node) => [node.name, node]));
  const downloaded = await downloadAllParallel(nodesToInstall, spinner);

  for (const node of nodesToInstall) {
    const payload = downloaded.get(node.name);
    if (!payload) {
      throw new Error(`Missing downloaded tarball for ${node.name}@${node.version}`);
    }

    spinner.text = `Extracting ${node.name}@${node.version}...`;
    const extractDir = extractDirForSkill(node.name);
    fs.mkdirSync(extractDir, { recursive: true });
    await extractSafely(payload.buffer, extractDir);
    verifyExtractedDependencies(extractDir, node);
  }

  lock.lockfileVersion = LOCKFILE_VERSION;
  const updatedLock = writeLockfileWithResolvedGraph(lock, resolvedNodes, downloaded);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify(updatedLock, null, 2)}\n`);

  await runLegacyFallback({
    rootSkillNames,
    resolvedNodeByName,
    extractDirForSkill,
    directory,
    configDir,
    global,
    homedir
  });

  linkInstalledRoots({
    rootSkillNames,
    resolvedNodeByName,
    extractDirForSkill,
    directory,
    global,
    resolvedHome,
    homedir
  });

  return updatedLock;
}

export async function installCommand(options: InstallOptions): Promise<void> {
  const {
    name,
    versionRange = '*',
    directory = process.cwd(),
    configDir,
    global = false,
    homedir,
    isTransitive = false
  } = options;

  const config = getConfig(configDir);
  const resolvedHome = homedir ?? os.homedir();
  const requestHeaders: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (config.token) {
    requestHeaders.Authorization = `Bearer ${config.token}`;
  }

  const resolvedManifest = resolveManifestPath(directory);
  const skillsJsonPath = resolvedManifest.exists ? resolvedManifest.path : path.join(directory, MANIFEST_FILENAME);
  const skillsJson = global ? { skills: {} } : readOrCreateSkillsJson(skillsJsonPath);
  const resolvedLock = global ? resolveLockfilePath(path.join(resolvedHome, '.tank')) : resolveLockfilePath(directory);
  const lockPath = resolvedLock.exists
    ? resolvedLock.path
    : global
      ? path.join(resolvedHome, '.tank', LOCKFILE_FILENAME)
      : path.join(directory, LOCKFILE_FILENAME);
  const lock = readLockOrFresh(lockPath);
  const spinner = ora('Resolving dependency graph...').start();

  try {
    const fetcher = createRegistryFetcher(config.registry, requestHeaders);
    const requestedVersions = await fetcher.fetchVersions(name);
    const requestedAvailableVersions = requestedVersions.map((versionInfo) => versionInfo.version);
    const requestedResolvedVersion = resolve(versionRange, requestedAvailableVersions);
    if (!requestedResolvedVersion) {
      throw new Error(
        `No version of ${name} satisfies range "${versionRange}". Available: ${requestedAvailableVersions.join(', ')}`
      );
    }

    const requestedLockKey = buildSkillKey(name, requestedResolvedVersion);
    if (lock.skills[requestedLockKey]) {
      logger.info(`${name}@${requestedResolvedVersion} is already installed`);
      spinner.succeed(`${name}@${requestedResolvedVersion} is already installed`);
      return;
    }

    const rootDependencies: Record<string, string> = {};
    if (!global && !isTransitive) {
      const existingSkills = (skillsJson.skills ?? {}) as Record<string, string>;
      const lockedVersionByName = buildLockedVersionByName(lock);

      for (const [skillName, range] of Object.entries(existingSkills)) {
        if (typeof range !== 'string') {
          continue;
        }

        rootDependencies[skillName] = lockedVersionByName.get(skillName) ?? range;
      }
    }
    rootDependencies[name] = versionRange;

    const resolvedGraph = await resolveDependencyTree(rootDependencies, fetcher);
    const resolvedNodes = getResolvedNodesInOrder(resolvedGraph.nodes, resolvedGraph.installOrder);
    const rootNode = resolvedGraph.nodes.get(name);
    if (!rootNode) {
      throw new Error(`Failed to resolve requested skill: ${name}`);
    }

    const nodesToInstall = resolvedNodes.filter((node) => {
      const lockKey = buildSkillKey(node.name, node.version);
      return !lock.skills[lockKey];
    });

    const projectPermissions = global ? undefined : (skillsJson.permissions as Permissions | undefined);
    const auditMinScore = global ? undefined : (skillsJson.audit as { min_score?: number } | undefined)?.min_score;

    await executeInstallPipeline({
      directory,
      configDir,
      global,
      homedir,
      resolvedHome,
      lock,
      lockPath,
      resolvedNodes,
      nodesToInstall,
      rootSkillNames: [name],
      projectPermissions,
      auditMinScore,
      spinner
    });

    if (!global && !isTransitive) {
      const skills = (skillsJson.skills ?? {}) as Record<string, string>;
      skills[name] = versionRange === '*' ? `^${rootNode.version}` : versionRange;
      skillsJson.skills = skills;
      fs.writeFileSync(skillsJsonPath, `${JSON.stringify(skillsJson, null, 2)}\n`);
    }

    spinner.succeed(`Installed ${name}@${rootNode.version}`);
  } catch (err) {
    spinner.fail('Install failed');
    throw err;
  }
}

export async function installFromLockfile(options: LockfileInstallOptions): Promise<void> {
  const { directory = process.cwd(), configDir, global = false, homedir } = options;
  const resolvedHome = homedir ?? os.homedir();
  const config = getConfig(configDir);

  const requestHeaders: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (config.token) {
    requestHeaders.Authorization = `Bearer ${config.token}`;
  }

  const resolvedLock = global ? resolveLockfilePath(path.join(resolvedHome, '.tank')) : resolveLockfilePath(directory);
  const lockPath = resolvedLock.path;
  if (!resolvedLock.exists) {
    throw new Error(`No ${LOCKFILE_FILENAME} found in ${directory}`);
  }

  let lock: SkillsLock;
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    lock = JSON.parse(raw) as SkillsLock;
  } catch {
    throw new Error(`Failed to read or parse ${path.basename(lockPath)}`);
  }

  const entries = Object.entries(lock.skills);
  if (entries.length === 0) {
    logger.info('No skills in lockfile');
    return;
  }

  const spinner = ora('Installing from lockfile...').start();
  const skillsDir = global ? getGlobalSkillsDir(resolvedHome) : path.join(directory, '.tank', 'skills');

  try {
    for (const [key, entry] of entries) {
      const skillName = parseLockKey(key);
      const version = parseVersionFromLockKey(key);
      spinner.text = `Installing ${key}...`;

      const encodedName = encodeURIComponent(skillName);
      const metaUrl = `${config.registry}/api/v1/skills/${encodedName}/${version}`;

      let metaRes: Response;
      try {
        metaRes = await fetch(metaUrl, {
          headers: requestHeaders
        });
      } catch (err) {
        throw new Error(`Network error fetching ${key}: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!metaRes.ok) {
        if (metaRes.status === 404) {
          throw new Error(`Skill or version not found: ${key}`);
        }
        const body = (await metaRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(`Failed to fetch ${key}: ${body?.error ?? metaRes.statusText}`);
      }

      const metadata = (await metaRes.json()) as VersionMetadata;
      const downloadUrl = metadata.downloadUrl;
      const downloadRes = await fetch(downloadUrl);
      if (!downloadRes.ok) {
        throw new Error(`Failed to download ${key}: ${downloadRes.status} ${downloadRes.statusText}`);
      }

      const tarballBuffer = Buffer.from(await downloadRes.arrayBuffer());
      const computedIntegrity = buildIntegrity(tarballBuffer);
      if (computedIntegrity !== entry.integrity) {
        throw new Error(`Integrity mismatch for ${key}. Expected: ${entry.integrity}, Got: ${computedIntegrity}`);
      }

      const extractDir = global ? getGlobalExtractDir(resolvedHome, skillName) : getExtractDir(directory, skillName);

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
            agentSkillsBaseDir
          });
          const linkResult = linkSkillToAgents({
            skillName,
            sourceDir: agentSkillDir,
            linksDir: path.join(resolvedHome, '.tank'),
            source: 'global',
            homedir
          });
          const detectedAgents = detectInstalledAgents(homedir);
          if (detectedAgents.length === 0) {
            logger.warn('No agents detected for linking');
          }
          if (linkResult.linked.length > 0) {
            logger.info(`Linked to ${linkResult.linked.length} agent(s)`);
          }
          if (linkResult.failed.length > 0) {
            for (const failedLink of linkResult.failed) {
              logger.warn(`Failed to link to ${failedLink.agentId}: ${failedLink.error}`);
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
  const config = getConfig(configDir);
  const requestHeaders: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (config.token) {
    requestHeaders.Authorization = `Bearer ${config.token}`;
  }

  const resolvedLock = global ? resolveLockfilePath(path.join(resolvedHome, '.tank')) : resolveLockfilePath(directory);
  const lockPath = resolvedLock.exists
    ? resolvedLock.path
    : global
      ? path.join(resolvedHome, '.tank', LOCKFILE_FILENAME)
      : path.join(directory, LOCKFILE_FILENAME);
  const resolvedManifest = resolveManifestPath(directory);
  const skillsJsonPath = resolvedManifest.path;

  if (resolvedLock.exists) {
    return installFromLockfile({ directory, configDir, global, homedir });
  }

  if (global) {
    logger.info(`No ${LOCKFILE_FILENAME} found — nothing to install`);
    return;
  }

  if (!resolvedManifest.exists) {
    logger.info(`No ${MANIFEST_FILENAME} found — nothing to install`);
    return;
  }

  const skillsJson = readSkillsJson(skillsJsonPath);
  const skills = (skillsJson.skills ?? {}) as Record<string, string>;
  const skillEntries = Object.entries(skills);

  if (skillEntries.length === 0) {
    logger.info(`No skills defined in ${MANIFEST_FILENAME}`);
    return;
  }

  const spinner = ora('Resolving dependency graph...').start();

  try {
    const rootDependencies: Record<string, string> = {};
    for (const [skillName, range] of skillEntries) {
      if (typeof range === 'string') {
        rootDependencies[skillName] = range;
      }
    }

    const fetcher = createRegistryFetcher(config.registry, requestHeaders);
    const resolvedGraph = await resolveDependencyTree(rootDependencies, fetcher);
    const resolvedNodes = getResolvedNodesInOrder(resolvedGraph.nodes, resolvedGraph.installOrder);
    const lock: SkillsLock = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
    const projectPermissions = skillsJson.permissions as Permissions | undefined;
    const auditMinScore = (skillsJson.audit as { min_score?: number } | undefined)?.min_score;

    await executeInstallPipeline({
      directory,
      configDir,
      global,
      homedir,
      resolvedHome,
      lock,
      lockPath,
      resolvedNodes,
      nodesToInstall: resolvedNodes,
      rootSkillNames: skillEntries.map(([skillName]) => skillName),
      projectPermissions,
      auditMinScore,
      spinner
    });

    spinner.succeed(`Installed ${skillEntries.length} root skill${skillEntries.length === 1 ? '' : 's'}`);
  } catch (err) {
    spinner.fail('Install failed');
    throw err;
  }
}

function buildIntegrity(buffer: Buffer): string {
  const hash = crypto.createHash('sha512').update(buffer).digest('base64');
  return `sha512-${hash}`;
}

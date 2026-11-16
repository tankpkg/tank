import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolve } from '@internals/helpers';
import {
  isLocalLinkLockEntry,
  LOCKFILE_FILENAME,
  LOCKFILE_VERSION,
  type LockedSkill,
  MANIFEST_FILENAME,
  type Permissions,
  permissionsReadSchema,
  type ScanVerdict,
  type SkillSource,
  type SkillsLock
} from '@internals/schemas';
import ora from 'ora';
import { z } from 'zod';

import { detectInstalledAgents, getGlobalAgentSkillsDir, getGlobalSkillsDir } from '~/lib/agents.js';
import { applyProxyWrapping } from '~/lib/apply-proxy-wrapping.js';
import { getConfig } from '~/lib/config.js';
import {
  buildSkillKey,
  type RegistryFetcher,
  type RegistrySkillMeta,
  type RegistryVersionInfo,
  type ResolvedNode,
  resolveDependencyTree
} from '~/lib/dependency-resolver.js';
import { hasFrontmatter, prepareAgentSkillDir } from '~/lib/frontmatter.js';
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
import { type LinkResult, linkSkillToAgents } from '~/lib/linker.js';
import {
  createLocalAwareFetcher,
  diffLocalLockEntry,
  dropStaleLocalEntries,
  isLinkSpec,
  type LocalSkill,
  localRootDependencies,
  mergeLocalLockEntries,
  readLocalSkill,
  readLocalSkills,
  resolveLinkSpec,
  splitSkillSpecs
} from '~/lib/local-skills.js';
import { logger } from '~/lib/logger.js';
import {
  type ProjectManifest,
  projectManifestSchema,
  readJsonFile,
  readLockfileAt,
  resolveLockfilePath,
  resolveManifestPath,
  writeManifestSkill
} from '~/lib/manifest.js';
import { checkPermissionBudget } from '~/lib/permission-checker.js';
import { displayScanResults, enforceVerdict, type ScanResult, scanUrl } from '~/lib/scan-gate.js';
import { type FetchResult, fetchFromUrl, type UrlSourceType } from '~/lib/url-fetcher.js';
import { USER_AGENT } from '~/version.js';

export interface InstallOptions {
  name: string;
  versionRange?: string;
  directory?: string;
  configDir?: string;
  global?: boolean;
  homedir?: string;
  isTransitive?: boolean;
  dangerouslyNoTankProxy?: boolean;
}

export interface LockfileInstallOptions {
  directory?: string;
  configDir?: string;
  global?: boolean;
  homedir?: string;
  dangerouslyNoTankProxy?: boolean;
}

export interface InstallAllOptions {
  directory?: string;
  configDir?: string;
  global?: boolean;
  homedir?: string;
  dangerouslyNoTankProxy?: boolean;
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
  dangerouslyNoTankProxy?: boolean;
  /** Project-local `link:` skills. Budget-checked and linked; never downloaded or audited. */
  localSkills?: LocalSkill[];
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

function readSkillsJson(skillsJsonPath: string): ProjectManifest {
  return readJsonFile(skillsJsonPath, projectManifestSchema);
}

function readOrCreateSkillsJson(skillsJsonPath: string): ProjectManifest {
  if (!fs.existsSync(skillsJsonPath)) {
    const skillsJson: ProjectManifest = { skills: {} };
    fs.writeFileSync(skillsJsonPath, `${JSON.stringify(skillsJson, null, 2)}\n`);
    logger.info(`Created ${MANIFEST_FILENAME}`);
    return skillsJson;
  }

  return readSkillsJson(skillsJsonPath);
}

/** Missing lockfile → fresh one. An unreadable or invalid one is replaced with a warning (it gets rewritten). */
function readLockOrFresh(lockPath: string): SkillsLock {
  if (!fs.existsSync(lockPath)) {
    return { lockfileVersion: LOCKFILE_VERSION, skills: {} };
  }
  try {
    return readLockfileAt(lockPath);
  } catch (err) {
    logger.warn(`${err instanceof Error ? err.message : String(err)} — starting from an empty lockfile`);
    return { lockfileVersion: LOCKFILE_VERSION, skills: {} };
  }
}

function writeLock(lockPath: string, lock: SkillsLock): void {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
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

interface InstallPolicy {
  projectPermissions?: Permissions;
  auditMinScore?: number;
}

function checkAuditScore(node: ResolvedNode, auditMinScore: number): void {
  const score = node.meta.auditScore;
  if (score === null || score === undefined) {
    logger.warn(`Audit score not yet available for ${node.name}. Install proceeding without audit score check.`);
    return;
  }
  if (score < auditMinScore) {
    throw new Error(
      `Audit score ${score} for ${node.name} is below minimum threshold ${auditMinScore} defined in ${MANIFEST_FILENAME}`
    );
  }
}

/** Budget applies to every skill; the audit threshold only to registry skills (local ones are never scanned). */
function validateResolvedNodes(registryNodes: ResolvedNode[], localSkills: LocalSkill[], policy: InstallPolicy): void {
  const { projectPermissions, auditMinScore } = policy;
  if (!projectPermissions) {
    logger.warn(`No permission budget defined in ${MANIFEST_FILENAME}. Install proceeding without permission checks.`);
  }
  for (const node of registryNodes) {
    if (projectPermissions) {
      checkPermissionBudget(projectPermissions, node.meta.permissions as Permissions, node.name);
    }
    if (auditMinScore !== undefined) checkAuditScore(node, auditMinScore);
  }
  if (!projectPermissions) return;
  for (const local of localSkills) {
    checkPermissionBudget(projectPermissions, local.permissions, local.name);
  }
}

interface RegistryPartition {
  /** Resolved registry nodes (local skills removed). */
  nodes: ResolvedNode[];
  /** Registry nodes that still need download + extract. */
  toInstall: ResolvedNode[];
  rootNames: string[];
}

/**
 * Split local skills out of the resolved graph once. Local nodes carry placeholder
 * metadata (see `localSkillToMeta`) and must never reach download or the registry lock writer.
 */
function partitionRegistryNodes(options: ExecuteInstallPipelineOptions, localSkills: LocalSkill[]): RegistryPartition {
  const localNames = new Set(localSkills.map((local) => local.name));
  const isRegistry = (name: string): boolean => !localNames.has(name);
  return {
    nodes: options.resolvedNodes.filter((node) => isRegistry(node.name)),
    toInstall: options.nodesToInstall.filter((node) => isRegistry(node.name)),
    rootNames: options.rootSkillNames.filter(isRegistry)
  };
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

function installToolDependencies(extractDir: string, skillName: string): void {
  const packageJsonPath = path.join(extractDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return;

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const hasDeps =
      (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
      (pkg.peerDependencies && Object.keys(pkg.peerDependencies).length > 0);
    if (!hasDeps) return;

    execSync('npm install --production --ignore-scripts --no-audit --no-fund', {
      cwd: extractDir,
      stdio: 'pipe',
      timeout: 60_000
    });
  } catch {
    logger.warn(`Dependency install skipped for ${skillName} (non-fatal)`);
  }
}

function wrapMcpServerForSkill(options: {
  skillName: string;
  extractDir: string;
  homedir?: string;
  dangerouslyNoTankProxy?: boolean;
}): void {
  try {
    const agents = detectInstalledAgents(options.homedir);
    if (agents.length === 0) return;
    const result = applyProxyWrapping({
      skillName: options.skillName,
      skillDir: options.extractDir,
      agentIds: agents.map((a) => a.id),
      ...(options.homedir !== undefined ? { homedir: options.homedir } : {}),
      ...(options.dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
    });
    if (result.wrapped.length > 0) {
      const mode = options.dangerouslyNoTankProxy ? 'registered (proxy disabled)' : 'proxy-wrapped';
      logger.info(`${options.skillName}: ${mode} in ${result.wrapped.length} agent config(s)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`MCP proxy wrapping skipped for ${options.skillName}: ${msg}`);
  }
}

async function linkInstalledSkills(options: {
  skillNames: string[];
  resolvedNodeByName: Map<string, ResolvedNode>;
  extractDirForSkill: (skillName: string) => string;
  directory: string;
  global: boolean;
  resolvedHome: string;
  homedir?: string;
  dangerouslyNoTankProxy?: boolean;
}): Promise<void> {
  const {
    skillNames,
    resolvedNodeByName,
    extractDirForSkill,
    directory,
    global,
    resolvedHome,
    homedir,
    dangerouslyNoTankProxy
  } = options;

  const agentSkillsBaseDir = global
    ? getGlobalAgentSkillsDir(resolvedHome)
    : path.join(directory, '.tank', 'agent-skills');
  const linksDir = global ? path.join(resolvedHome, '.tank') : path.join(directory, '.tank');

  for (const skillName of skillNames) {
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

      wrapMcpServerForSkill({
        skillName,
        extractDir: extractDirForSkill(skillName),
        homedir,
        dangerouslyNoTankProxy
      });
    } catch {
      if (skillNames.length === 1) {
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

  const agentToPlatform: Record<string, string> = {
    claude: 'claude-code',
    opencode: 'opencode',
    cursor: 'cursor',
    codex: 'claude-code',
    openclaw: 'opencode'
  };
  const platforms = new Set(detectedAgents.map((a) => agentToPlatform[a.id]).filter(Boolean));

  for (const skillName of skillNames) {
    const node = resolvedNodeByName.get(skillName);
    if (!node) continue;
    const skillDir = extractDirForSkill(skillName);
    const manifestPath = path.join(skillDir, 'tank.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!manifest.atoms || !Array.isArray(manifest.atoms) || manifest.atoms.length === 0) continue;
      const { buildCommand: runBuild } = await import('~/commands/build.js');
      for (const platform of platforms) {
        await runBuild({ skill: skillDir, target: directory, platform });
      }
    } catch {
      logger.warn(`Auto-build skipped for ${skillName} (non-fatal)`);
    }
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
    projectPermissions,
    auditMinScore,
    spinner,
    localSkills = []
  } = options;

  const registry = partitionRegistryNodes(options, localSkills);
  if (!global) {
    validateResolvedNodes(registry.nodes, localSkills, {
      ...(projectPermissions !== undefined ? { projectPermissions } : {}),
      ...(auditMinScore !== undefined ? { auditMinScore } : {})
    });
  }

  const registryNodes = registry.nodes;
  const registryNodesToInstall = registry.toInstall;
  const extractDirForSkill = createExtractDirResolver(directory, global, resolvedHome);
  const resolvedNodeByName = new Map(registryNodes.map((node) => [node.name, node]));
  const downloaded = await downloadAllParallel(registryNodesToInstall, (msg) => {
    spinner.text = msg;
  });

  for (const node of registryNodesToInstall) {
    const payload = downloaded.get(node.name);
    if (!payload) {
      throw new Error(`Missing downloaded tarball for ${node.name}@${node.version}`);
    }

    spinner.text = `Extracting ${node.name}@${node.version}...`;
    const extractDir = extractDirForSkill(node.name);
    fs.mkdirSync(extractDir, { recursive: true });
    await extractSafely(payload.buffer, extractDir);
    verifyExtractedDependencies(extractDir, node);

    spinner.text = `Installing dependencies for ${node.name}...`;
    installToolDependencies(extractDir, node.name);
  }

  lock.lockfileVersion = LOCKFILE_VERSION;
  const updatedLock = mergeLocalLockEntries(
    writeLockfileWithResolvedGraph(lock, registryNodes, downloaded),
    localSkills
  );
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify(updatedLock, null, 2)}\n`);

  await runLegacyFallback({
    rootSkillNames: registry.rootNames,
    resolvedNodeByName,
    extractDirForSkill,
    directory,
    configDir,
    global,
    homedir
  });

  await linkInstalledSkills({
    skillNames: registryNodesToInstall.map((node) => node.name),
    resolvedNodeByName,
    extractDirForSkill,
    directory,
    global,
    resolvedHome,
    homedir,
    ...(options.dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
  });

  linkLocalSkills(localSkills, { directory, ...(homedir !== undefined ? { homedir } : {}) });

  return updatedLock;
}

interface LocalLinkOptions {
  directory: string;
  homedir?: string;
}

function reportLinkResult(skillName: string, result: LinkResult): void {
  if (result.linked.length > 0) {
    logger.info(`${skillName}: linked to ${result.linked.length} agent(s)`);
  }
  for (const failedLink of result.failed) {
    logger.warn(`Failed to link ${skillName} to ${failedLink.agentId}: ${failedLink.error}`);
  }
}

/**
 * Agents read the local folder directly when SKILL.md already has frontmatter, so edits are live
 * (same rule as `tank link`). Otherwise a copy with generated frontmatter goes to .tank/agent-skills.
 */
function localAgentSourceDir(local: LocalSkill, directory: string): string {
  const content = fs.readFileSync(path.join(local.dir, 'SKILL.md'), 'utf-8');
  if (hasFrontmatter(content)) {
    return local.dir;
  }
  return prepareAgentSkillDir({
    skillName: local.name,
    extractDir: local.dir,
    agentSkillsBaseDir: path.join(directory, '.tank', 'agent-skills'),
    ...(local.description !== undefined ? { description: local.description } : {})
  });
}

function linkLocalSkills(localSkills: LocalSkill[], options: LocalLinkOptions): void {
  for (const local of localSkills) {
    try {
      const result = linkSkillToAgents({
        skillName: local.name,
        sourceDir: localAgentSourceDir(local, options.directory),
        linksDir: path.join(options.directory, '.tank'),
        source: 'local',
        homedir: options.homedir
      });
      reportLinkResult(local.name, result);
    } catch (err) {
      logger.warn(`Agent linking skipped for ${local.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    warnIfLocalMcpServer(local);
  }
}

/**
 * Local skills are never scanned, so their `mcp_server` is NOT registered in user-level agent
 * config (which would make a repo-supplied command active in every project). Tell the user instead.
 */
function warnIfLocalMcpServer(local: LocalSkill): void {
  if (!local.hasMcpServer) return;
  logger.warn(
    `${local.name}: mcp_server not registered — local skills are not scanned. Register it manually if trusted.`
  );
}

export async function installCommand(options: InstallOptions): Promise<void> {
  const {
    name,
    versionRange = '*',
    directory = process.cwd(),
    configDir,
    global = false,
    homedir,
    isTransitive = false,
    dangerouslyNoTankProxy
  } = options;

  const config = getConfig(configDir);
  const resolvedHome = homedir ?? os.homedir();
  const requestHeaders: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (config.token) {
    requestHeaders.Authorization = `Bearer ${config.token}`;
  }

  const resolvedManifest = resolveManifestPath(directory);
  const skillsJsonPath = resolvedManifest.exists ? resolvedManifest.path : path.join(directory, MANIFEST_FILENAME);
  const skillsJson: ProjectManifest = global ? { skills: {} } : readOrCreateSkillsJson(skillsJsonPath);
  const resolvedLock = global ? resolveLockfilePath(path.join(resolvedHome, '.tank')) : resolveLockfilePath(directory);
  const lockPath = resolvedLock.exists
    ? resolvedLock.path
    : global
      ? path.join(resolvedHome, '.tank', LOCKFILE_FILENAME)
      : path.join(directory, LOCKFILE_FILENAME);
  const lock = readLockOrFresh(lockPath);
  const spinner = ora('Resolving dependency graph...').start();

  try {
    const specs = splitSkillSpecs(global ? {} : (skillsJson.skills ?? {}));
    // A skill that left `link:` in tank.json (e.g. now published) must not keep its stale local lock entry.
    const staleLocalKeys = dropStaleLocalEntries(lock, specs.local);
    const requestedSpec = skillsJson.skills?.[name];
    if (isLinkSpec(requestedSpec)) {
      throw new Error(
        `${name} is a local skill (${requestedSpec}) in ${MANIFEST_FILENAME}. Run "tank install" with no arguments to link it.`
      );
    }

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
      if (staleLocalKeys.length > 0) writeLock(lockPath, lock);
      logger.info(`${name}@${requestedResolvedVersion} is already installed`);
      spinner.succeed(`${name}@${requestedResolvedVersion} is already installed`);
      return;
    }

    const rootDependencies: Record<string, string> = {};
    let localSkills: LocalSkill[] = [];
    if (!global && !isTransitive) {
      localSkills = readLocalSkills(specs.local, path.dirname(skillsJsonPath));
      const lockedVersionByName = buildLockedVersionByName(lock);

      for (const [skillName, range] of Object.entries(specs.registry)) {
        rootDependencies[skillName] = lockedVersionByName.get(skillName) ?? range;
      }
      Object.assign(rootDependencies, localRootDependencies(localSkills));
    }
    rootDependencies[name] = versionRange;

    const resolvedGraph = await resolveDependencyTree(rootDependencies, createLocalAwareFetcher(fetcher, localSkills));
    const resolvedNodes = getResolvedNodesInOrder(resolvedGraph.nodes, resolvedGraph.installOrder);
    const rootNode = resolvedGraph.nodes.get(name);
    if (!rootNode) {
      throw new Error(`Failed to resolve requested skill: ${name}`);
    }

    const nodesToInstall = resolvedNodes.filter((node) => {
      const lockKey = buildSkillKey(node.name, node.version);
      return !lock.skills[lockKey];
    });

    const projectPermissions = global ? undefined : skillsJson.permissions;
    const auditMinScore = global ? undefined : skillsJson.audit?.min_score;

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
      spinner,
      localSkills,
      ...(dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
    });

    if (!global && !isTransitive) {
      writeManifestSkill(skillsJsonPath, name, versionRange === '*' ? `^${rootNode.version}` : versionRange);
    }

    spinner.succeed(`Installed ${name}@${rootNode.version}`);
  } catch (err) {
    spinner.fail('Install failed');
    throw err;
  }
}

export async function installFromLockfile(options: LockfileInstallOptions): Promise<void> {
  const { directory = process.cwd(), configDir, global = false, homedir, dangerouslyNoTankProxy } = options;
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

  // Validated: local entries are trusted to point inside the project only after the schema check.
  const lock = readLockfileAt(lockPath);

  const entries = Object.entries(lock.skills);
  if (entries.length === 0) {
    logger.info('No skills in lockfile');
    return;
  }

  // Validate every local entry (path, name, drift, budget) before any download or link.
  const localSkills = readLockedLocalSkills(entries, directory, global);
  if (!global) {
    assertLocalSkillsMatchManifest(localSkills, directory);
  }

  const spinner = ora('Installing from lockfile...').start();
  const skillsDir = global ? getGlobalSkillsDir(resolvedHome) : path.join(directory, '.tank', 'skills');

  try {
    for (const [key, entry] of entries) {
      if (isLocalLinkLockEntry(entry)) {
        continue;
      }
      const skillName = parseLockKey(key);
      const version = parseVersionFromLockKey(key);
      spinner.text = `Installing ${key}...`;

      const extractDir = global ? getGlobalExtractDir(resolvedHome, skillName) : getExtractDir(directory, skillName);
      const alreadyExtracted = fs.existsSync(path.join(extractDir, 'tank.json'));

      if (!alreadyExtracted && entry.source === 'local') {
        throw new Error(
          `${key} was installed from a path on another machine (${entry.resolved}) and cannot be restored from ${LOCKFILE_FILENAME}. ` +
            `To share a local skill, add it to ${MANIFEST_FILENAME} as "${skillName}": "link:./path/to/skill".`
        );
      }

      if (!alreadyExtracted) {
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

        if (fs.existsSync(extractDir)) {
          fs.rmSync(extractDir, { recursive: true, force: true });
        }
        fs.mkdirSync(extractDir, { recursive: true });

        await extractSafely(tarballBuffer, extractDir);
      }

      try {
        const agentSkillsBaseDir = global
          ? getGlobalAgentSkillsDir(resolvedHome)
          : path.join(directory, '.tank', 'agent-skills');
        const linksDir = global ? path.join(resolvedHome, '.tank') : path.join(directory, '.tank');
        const agentSkillDir = prepareAgentSkillDir({
          skillName,
          extractDir,
          agentSkillsBaseDir
        });
        const linkResult = linkSkillToAgents({
          skillName,
          sourceDir: agentSkillDir,
          linksDir,
          source: global ? 'global' : 'local',
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

      wrapMcpServerForSkill({
        skillName,
        extractDir,
        ...(homedir !== undefined ? { homedir } : {}),
        ...(dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
      });
    }

    linkLocalSkills(localSkills, { directory, ...(homedir !== undefined ? { homedir } : {}) });

    spinner.succeed(`Installed ${entries.length} skill${entries.length === 1 ? '' : 's'} from lockfile`);
  } catch (err) {
    spinner.fail('Install from lockfile failed');
    if (fs.existsSync(skillsDir)) {
      fs.rmSync(skillsDir, { recursive: true, force: true });
    }
    throw err;
  }
}

const LOCKFILE_REFRESH_HINT = `Delete ${LOCKFILE_FILENAME} and run "tank install" to re-resolve, then review the diff.`;

function readLockedLocalSkills(
  entries: Array<[string, LockedSkill]>,
  projectRoot: string,
  global: boolean
): LocalSkill[] {
  const localEntries = entries.filter(([, entry]) => isLocalLinkLockEntry(entry));
  if (localEntries.length > 0 && global) {
    throw new Error(`Global ${LOCKFILE_FILENAME} has "link:" entries; local skills are project-only.`);
  }
  return localEntries.map(([key, entry]) => {
    const local = readLocalSkill(parseLockKey(key), entry.resolved, projectRoot);
    const changed = diffLocalLockEntry(parseVersionFromLockKey(key), entry, local);
    if (changed.length > 0) {
      throw new Error(
        `Local skill ${key} changed since ${LOCKFILE_FILENAME} was written (${changed.join(', ')}). ${LOCKFILE_REFRESH_HINT}`
      );
    }
    return local;
  });
}

/** tank.json `link:` specs and the lock's local entries must agree in both directions, at the same paths. */
function assertLockMatchesManifestLinks(
  lockedLocals: LocalSkill[],
  manifestLinks: Record<string, string>,
  directory: string
): void {
  const lockedByName = new Map(lockedLocals.map((skill) => [skill.name, skill]));
  for (const [name, spec] of Object.entries(manifestLinks)) {
    const locked = lockedByName.get(name);
    if (!locked) {
      throw new Error(`Local skill ${name} (${spec}) is not in ${LOCKFILE_FILENAME}. ${LOCKFILE_REFRESH_HINT}`);
    }
    const manifestSpec = resolveLinkSpec(name, spec, directory).spec;
    if (manifestSpec !== locked.spec) {
      throw new Error(
        `Local skill ${name}: ${MANIFEST_FILENAME} links ${manifestSpec} but ${LOCKFILE_FILENAME} has ${locked.spec}. ${LOCKFILE_REFRESH_HINT}`
      );
    }
  }
  assertNoUnlistedLocalEntries(lockedLocals, manifestLinks);
}

function assertNoUnlistedLocalEntries(lockedLocals: LocalSkill[], manifestLinks: Record<string, string>): void {
  const unlisted = lockedLocals.filter((skill) => manifestLinks[skill.name] === undefined).map((skill) => skill.name);
  if (unlisted.length === 0) return;
  throw new Error(
    `${LOCKFILE_FILENAME} has local skills that are no longer "link:" entries in ${MANIFEST_FILENAME}: ${unlisted.join(', ')}. ${LOCKFILE_REFRESH_HINT}`
  );
}

/** Lockfile install: local entries must match tank.json's `link:` specs and fit the project budget. */
function assertLocalSkillsMatchManifest(lockedLocals: LocalSkill[], directory: string): void {
  const resolvedManifest = resolveManifestPath(directory);
  const manifest: ProjectManifest = resolvedManifest.exists ? readSkillsJson(resolvedManifest.path) : {};
  assertLockMatchesManifestLinks(lockedLocals, splitSkillSpecs(manifest.skills ?? {}).local, directory);
  const budget = manifest.permissions;
  if (!budget) return;
  for (const skill of lockedLocals) {
    checkPermissionBudget(budget, skill.permissions, skill.name);
  }
}

export async function installAll(options: InstallAllOptions): Promise<void> {
  const { directory = process.cwd(), configDir, global = false, homedir, dangerouslyNoTankProxy } = options;
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
    return installFromLockfile({
      directory,
      configDir,
      global,
      homedir,
      ...(dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
    });
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
  const skills = skillsJson.skills ?? {};
  const skillEntries = Object.entries(skills);

  if (skillEntries.length === 0) {
    logger.info(`No skills defined in ${MANIFEST_FILENAME}`);
    return;
  }

  const spinner = ora('Resolving dependency graph...').start();

  try {
    const specs = splitSkillSpecs(skills);
    const localSkills = readLocalSkills(specs.local, path.dirname(skillsJsonPath));
    const rootDependencies = { ...specs.registry, ...localRootDependencies(localSkills) };

    const fetcher = createLocalAwareFetcher(createRegistryFetcher(config.registry, requestHeaders), localSkills);
    const resolvedGraph = await resolveDependencyTree(rootDependencies, fetcher);
    const resolvedNodes = getResolvedNodesInOrder(resolvedGraph.nodes, resolvedGraph.installOrder);
    const lock: SkillsLock = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
    const projectPermissions = skillsJson.permissions;
    const auditMinScore = skillsJson.audit?.min_score;

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
      rootSkillNames: Object.keys(specs.registry),
      projectPermissions,
      auditMinScore,
      spinner,
      localSkills,
      ...(dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
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

// ---------------------------------------------------------------------------
// URL-based install
// ---------------------------------------------------------------------------

/** Map url-fetcher source types to lockfile SkillSource values. */
function mapSourceType(urlSourceType: UrlSourceType): SkillSource {
  switch (urlSourceType) {
    case 'github':
      return 'github';
    case 'clawhub':
      return 'clawhub';
    case 'skills_sh':
      return 'skills_sh';
    case 'agentskills_il':
      return 'agentskills_il';
    case 'npm':
      return 'npm';
    default:
      return 'local';
  }
}

/** Compute SHA-512 integrity hash over all files in a directory (sorted by path). */
function computeDirectoryIntegrity(dir: string): string {
  const files: string[] = [];

  function walkDir(current: string): void {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walkDir(dir);
  files.sort();

  const hash = crypto.createHash('sha512');
  for (const file of files) {
    hash.update(fs.readFileSync(file));
  }
  return `sha512-${hash.digest('base64')}`;
}

/** Read a manifest (tank.json or skills.json) from a directory, returning null if missing/invalid. */
function readManifestFromDir(dir: string): Record<string, unknown> | null {
  for (const filename of ['tank.json', 'skills.json']) {
    const manifestPath = path.join(dir, filename);
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

const urlSkillManifestSchema = z.looseObject({ permissions: permissionsReadSchema.optional() });

/**
 * A URL-installed skill's tank.json is third-party input: validate its permissions before they
 * reach tank.lock (whose schema is strict). Invalid permissions abort the install rather than
 * being recorded as "none".
 */
function readUrlSkillPermissions(skillDir: string, skillName: string): Permissions {
  const manifestPath = resolveManifestPath(skillDir);
  if (!manifestPath.exists) return {};
  try {
    return readJsonFile(manifestPath.path, urlSkillManifestSchema).permissions ?? {};
  } catch (err) {
    throw new Error(`${skillName}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface InstallFromUrlOptions {
  global?: boolean;
  yes?: boolean;
  dangerouslyNoTankProxy?: boolean;
}

export async function installFromUrl(url: string, options: InstallFromUrlOptions): Promise<void> {
  const { global = false, yes = false, dangerouslyNoTankProxy } = options;
  const resolvedHome = os.homedir();
  const directory = process.cwd();

  const spinner = ora(`Fetching from URL...`).start();

  // 1. Fetch from URL
  let fetchResult: FetchResult;
  try {
    const output = await fetchFromUrl(url);
    if (!output.success) {
      spinner.fail('Fetch failed');
      logger.error(output.error);
      process.exit(1);
    }
    fetchResult = output;
    spinner.text = 'Scanning for security issues...';
  } catch (err) {
    spinner.fail('Fetch failed');
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(msg);
    process.exit(1);
  }

  try {
    // 2. Scan via public API — skip for file:// URLs (local fixtures do not
    //    require remote scanning; the scan API only meaningfully evaluates
    //    public URLs). A file:// install is equivalent to a user pointing
    //    Tank at a local directory they already control.
    let scanResult: ScanResult | null = null;
    if (!url.startsWith('file://')) {
      scanResult = await scanUrl(url);
      displayScanResults(scanResult);

      const enforcement = await enforceVerdict(scanResult, { yes });
      if (!enforcement.allowed) {
        spinner.fail(enforcement.reason ?? 'Install blocked by security scan');
        await fetchResult.cleanup();
        process.exit(1);
      }
    }

    // 3. Validate skill structure
    const skillMdPath = path.join(fetchResult.localPath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      throw new Error("No SKILL.md found. This doesn't appear to be a valid skill.");
    }

    // 4. Read or generate manifest
    const existingManifest = readManifestFromDir(fetchResult.localPath);
    const skillName =
      (existingManifest?.name as string) ?? fetchResult.inferredName ?? path.basename(fetchResult.localPath);
    const skillVersion = (existingManifest?.version as string) ?? '0.0.0';
    const skillDescription = (existingManifest?.description as string) ?? '';

    if (!existingManifest) {
      const generatedManifest = {
        name: skillName,
        version: skillVersion,
        description: skillDescription
      };
      fs.writeFileSync(
        path.join(fetchResult.localPath, 'tank.json'),
        `${JSON.stringify(generatedManifest, null, 2)}\n`
      );
      logger.info('Generated tank.json (no manifest found in source)');
    }

    // Validate before anything is copied, so invalid permissions leave no partial install.
    const skillPermissions = readUrlSkillPermissions(fetchResult.localPath, skillName);
    spinner.text = `Installing ${skillName}...`;

    // 5. Determine install location + 6. Copy files
    const installDir = global
      ? path.join(resolvedHome, '.tank', 'skills', skillName)
      : path.join(directory, '.tank', 'skills', skillName);

    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(installDir), { recursive: true });
    fs.cpSync(fetchResult.localPath, installDir, { recursive: true });

    // 7. Compute integrity hash
    const integrity = computeDirectoryIntegrity(installDir);

    // 8. Write lockfile entry
    const lockDir = global ? path.join(resolvedHome, '.tank') : directory;
    const resolvedLock = resolveLockfilePath(lockDir);
    const lockPath = resolvedLock.exists
      ? resolvedLock.path
      : global
        ? path.join(resolvedHome, '.tank', LOCKFILE_FILENAME)
        : path.join(directory, LOCKFILE_FILENAME);

    const lock = readLockOrFresh(lockPath);
    const lockKey = `${skillName}@${skillVersion}`;

    lock.skills[lockKey] = {
      resolved: url.startsWith('http') ? url : url.startsWith('file://') ? url : `https://${url}`,
      integrity,
      permissions: skillPermissions,
      audit_score: scanResult?.auditScore ?? null,
      source: mapSourceType(fetchResult.sourceType),
      scan_verdict: (scanResult?.verdict ?? 'pass') as ScanVerdict,
      scanned_at: new Date().toISOString()
    };

    lock.lockfileVersion = LOCKFILE_VERSION as 1 | 2;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    // 9. Link to agents
    const linkedAgents: string[] = [];
    try {
      const agentSkillsBaseDir = global
        ? getGlobalAgentSkillsDir(resolvedHome)
        : path.join(directory, '.tank', 'agent-skills');
      const linksDir = global ? path.join(resolvedHome, '.tank') : path.join(directory, '.tank');

      const agentSkillDir = prepareAgentSkillDir({
        skillName,
        extractDir: installDir,
        agentSkillsBaseDir,
        description: skillDescription
      });
      const linkResult = linkSkillToAgents({
        skillName,
        sourceDir: agentSkillDir,
        linksDir,
        source: global ? 'global' : 'local'
      });

      linkedAgents.push(...linkResult.linked);
      if (linkResult.failed.length > 0) {
        for (const failedLink of linkResult.failed) {
          logger.warn(`Failed to link to ${failedLink.agentId}: ${failedLink.error}`);
        }
      }
    } catch {
      logger.warn('Agent linking skipped (non-fatal)');
    }

    const detectedAgents = detectInstalledAgents();
    if (detectedAgents.length === 0) {
      logger.warn('No agents detected for linking');
    }

    wrapMcpServerForSkill({
      skillName,
      extractDir: installDir,
      ...(dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
    });

    // 10. Clean up temp dir
    await fetchResult.cleanup();

    // 11. Print success message
    spinner.succeed(`Installed ${skillName} from ${fetchResult.sourceType}`);
    if (linkedAgents.length > 0) {
      logger.info(`Linked to ${linkedAgents.join(', ')}`);
    }
    logger.info(`Locked (${integrity.slice(0, 20)}..., scanned ${new Date().toISOString().split('T')[0]})`);
  } catch (err) {
    await fetchResult.cleanup();
    spinner.fail('Install failed');
    throw err;
  }
}

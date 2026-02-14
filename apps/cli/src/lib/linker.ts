import fs from 'node:fs';
import path from 'node:path';
import { detectInstalledAgents, getSymlinkName, type AgentInfo } from './agents.js';
import { readLinks, writeLinks, type LinksManifest, type LinkEntry } from './links.js';

export interface LinkResult {
  linked: string[];
  skipped: string[];
  failed: Array<{ agentId: string; error: string }>;
}

export interface UnlinkResult {
  unlinked: string[];
  notFound: string[];
}

export interface AgentLinkStatus {
  agentId: string;
  agentName: string;
  linked: boolean;
  symlinkPath: string;
  targetValid: boolean;
}

interface LinkOptions {
  skillName: string;
  sourceDir: string;
  linksDir: string;
  source: 'local' | 'global' | 'dev';
  homedir?: string;
}

interface UnlinkOptions {
  skillName: string;
  linksDir: string;
  homedir?: string;
}

interface StatusOptions {
  skillName: string;
  linksDir: string;
  homedir?: string;
}

interface AllStatusOptions {
  linksDir: string;
  homedir?: string;
}

interface SymlinkCheck {
  exists: boolean;
  isSymlink: boolean;
  targetPath: string | null;
  targetValid: boolean;
}

const resolveSymlinkTarget = (symlinkPath: string, target: string): string => {
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.resolve(path.dirname(symlinkPath), target);
};

const checkSymlink = (symlinkPath: string): SymlinkCheck => {
  try {
    const stats = fs.lstatSync(symlinkPath);
    if (!stats.isSymbolicLink()) {
      return { exists: true, isSymlink: false, targetPath: null, targetValid: false };
    }

    const rawTarget = fs.readlinkSync(symlinkPath);
    const targetPath = resolveSymlinkTarget(symlinkPath, rawTarget);
    const targetValid = fs.existsSync(targetPath);
    return { exists: true, isSymlink: true, targetPath, targetValid };
  } catch {
    return { exists: false, isSymlink: false, targetPath: null, targetValid: false };
  }
};

const createEntry = (
  manifest: LinksManifest,
  skillName: string,
  entry: LinkEntry,
): LinksManifest => ({
  version: manifest.version,
  links: {
    ...manifest.links,
    [skillName]: entry,
  },
});

export function linkSkillToAgents(options: LinkOptions): LinkResult {
  const result: LinkResult = { linked: [], skipped: [], failed: [] };
  const agents = detectInstalledAgents(options.homedir);
  const symlinkName = getSymlinkName(options.skillName);
  const resolvedSource = path.resolve(options.sourceDir);
  const agentLinks: Record<string, string> = {};

  for (const agent of agents) {
    const symlinkPath = path.join(agent.skillsDir, symlinkName);

    try {
      fs.mkdirSync(agent.skillsDir, { recursive: true });
      const check = checkSymlink(symlinkPath);

      if (check.exists && !check.isSymlink) {
        result.failed.push({
          agentId: agent.id,
          error: `Path exists and is not a symlink: ${symlinkPath}`,
        });
        continue;
      }

      if (check.exists && check.isSymlink && check.targetPath) {
        const targetMatches = path.resolve(check.targetPath) === resolvedSource;
        if (targetMatches && check.targetValid) {
          result.skipped.push(agent.id);
          agentLinks[agent.id] = symlinkPath;
          continue;
        }

        fs.unlinkSync(symlinkPath);
      }

      fs.symlinkSync(options.sourceDir, symlinkPath, 'dir');
      result.linked.push(agent.id);
      agentLinks[agent.id] = symlinkPath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ agentId: agent.id, error: message });
    }
  }

  const manifest = readLinks(options.linksDir);
  const entry: LinkEntry = {
    source: options.source,
    sourceDir: options.sourceDir,
    installedAt: new Date().toISOString(),
    agentLinks,
  };
  const updated = createEntry(manifest, options.skillName, entry);
  writeLinks(options.linksDir, updated);

  return result;
}

export function unlinkSkillFromAgents(options: UnlinkOptions): UnlinkResult {
  const manifest = readLinks(options.linksDir);
  const entry = manifest.links[options.skillName];
  if (!entry) {
    return { unlinked: [], notFound: [] };
  }

  const result: UnlinkResult = { unlinked: [], notFound: [] };
  for (const [agentId, symlinkPath] of Object.entries(entry.agentLinks)) {
    try {
      const stats = fs.lstatSync(symlinkPath);
      if (!stats.isSymbolicLink()) {
        result.notFound.push(agentId);
        continue;
      }

      fs.unlinkSync(symlinkPath);
      result.unlinked.push(agentId);
    } catch {
      result.notFound.push(agentId);
    }
  }

  const updated: LinksManifest = {
    version: manifest.version,
    links: { ...manifest.links },
  };
  if (options.skillName in updated.links) {
    delete updated.links[options.skillName];
  }
  writeLinks(options.linksDir, updated);

  return result;
}

const getStatusForAgent = (
  agent: AgentInfo,
  skillName: string,
): AgentLinkStatus => {
  const symlinkName = getSymlinkName(skillName);
  const symlinkPath = path.join(agent.skillsDir, symlinkName);
  const check = checkSymlink(symlinkPath);

  return {
    agentId: agent.id,
    agentName: agent.name,
    linked: check.exists && check.isSymlink,
    symlinkPath,
    targetValid: check.exists && check.isSymlink && check.targetValid,
  };
};

export function getSkillLinkStatus(options: StatusOptions): AgentLinkStatus[] {
  const agents = detectInstalledAgents(options.homedir);
  readLinks(options.linksDir);
  return agents.map((agent) => getStatusForAgent(agent, options.skillName));
}

export function getAllLinkStatuses(options: AllStatusOptions): Record<string, AgentLinkStatus[]> {
  const agents = detectInstalledAgents(options.homedir);
  const manifest = readLinks(options.linksDir);
  const result: Record<string, AgentLinkStatus[]> = {};

  for (const skillName of Object.keys(manifest.links)) {
    result[skillName] = agents.map((agent) => getStatusForAgent(agent, skillName));
  }

  return result;
}

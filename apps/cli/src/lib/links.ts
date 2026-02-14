import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface LinkEntry {
  source: 'local' | 'global' | 'dev';
  sourceDir: string;
  installedAt: string;
  agentLinks: Record<string, string>;
}

export interface LinksManifest {
  version: 1;
  links: Record<string, LinkEntry>;
}

export function createEmptyManifest(): LinksManifest {
  return { version: 1, links: {} };
}

export function readLinks(linksDir: string): LinksManifest {
  if (!fs.existsSync(linksDir)) {
    return createEmptyManifest();
  }

  const linksPath = path.join(linksDir, 'links.json');
  if (!fs.existsSync(linksPath)) {
    return createEmptyManifest();
  }

  try {
    const raw = fs.readFileSync(linksPath, 'utf-8');
    return JSON.parse(raw) as LinksManifest;
  } catch {
    return createEmptyManifest();
  }
}

export function writeLinks(linksDir: string, manifest: LinksManifest): void {
  if (!fs.existsSync(linksDir)) {
    fs.mkdirSync(linksDir, { recursive: true });
  }

  const sortedLinks: Record<string, LinkEntry> = {};
  for (const skillName of Object.keys(manifest.links).sort()) {
    const entry = manifest.links[skillName];
    const sortedAgentLinks: Record<string, string> = {};
    for (const agentId of Object.keys(entry.agentLinks).sort()) {
      sortedAgentLinks[agentId] = entry.agentLinks[agentId];
    }

    sortedLinks[skillName] = {
      source: entry.source,
      sourceDir: entry.sourceDir,
      installedAt: entry.installedAt,
      agentLinks: sortedAgentLinks,
    };
  }

  const output: LinksManifest = {
    version: manifest.version,
    links: sortedLinks,
  };

  fs.writeFileSync(path.join(linksDir, 'links.json'), JSON.stringify(output, null, 2) + '\n');
}

export function readLocalLinks(projectDir?: string): LinksManifest {
  const dir = projectDir ?? process.cwd();
  return readLinks(path.join(dir, '.tank'));
}

export function readGlobalLinks(homedir?: string): LinksManifest {
  const home = homedir ?? os.homedir();
  return readLinks(path.join(home, '.tank'));
}

export function addLink(
  manifest: LinksManifest,
  skillName: string,
  entry: LinkEntry,
): LinksManifest {
  return {
    version: manifest.version,
    links: {
      ...manifest.links,
      [skillName]: entry,
    },
  };
}

export function removeLink(manifest: LinksManifest, skillName: string): LinksManifest {
  const links = { ...manifest.links };
  if (skillName in links) {
    delete links[skillName];
  }

  return {
    version: manifest.version,
    links,
  };
}

export function getLinksForSkill(
  manifest: LinksManifest,
  skillName: string,
): LinkEntry | undefined {
  return manifest.links[skillName];
}

export function addAgentLink(
  manifest: LinksManifest,
  skillName: string,
  agentId: string,
  symlinkPath: string,
): LinksManifest {
  const existing = manifest.links[skillName];
  const baseEntry: LinkEntry = existing ?? {
    source: 'local',
    sourceDir: process.cwd(),
    installedAt: new Date().toISOString(),
    agentLinks: {},
  };

  const agentLinks = {
    ...baseEntry.agentLinks,
    [agentId]: symlinkPath,
  };

  return addLink(manifest, skillName, { ...baseEntry, agentLinks });
}

export function removeAgentLink(
  manifest: LinksManifest,
  skillName: string,
  agentId: string,
): LinksManifest {
  const existing = manifest.links[skillName];
  if (!existing) {
    return { version: manifest.version, links: { ...manifest.links } };
  }

  const agentLinks = { ...existing.agentLinks };
  if (agentId in agentLinks) {
    delete agentLinks[agentId];
  }

  if (Object.keys(agentLinks).length === 0) {
    return removeLink(manifest, skillName);
  }

  return addLink(manifest, skillName, { ...existing, agentLinks });
}

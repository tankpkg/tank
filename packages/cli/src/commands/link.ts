import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MANIFEST_FILENAME } from '@internals/schemas';

import { detectInstalledAgents, getGlobalAgentSkillsDir } from '~/lib/agents.js';
import { hasFrontmatter, prepareAgentSkillDir } from '~/lib/frontmatter.js';
import { linkSkillToAgents } from '~/lib/linker.js';
import { readGlobalLinks } from '~/lib/links.js';
import { logger } from '~/lib/logger.js';
import { resolveManifestPath } from '~/lib/manifest.js';

export interface LinkOptions {
  directory?: string;
  homedir?: string;
}

export async function linkCommand(options: LinkOptions = {}): Promise<void> {
  const workDir = options.directory ?? process.cwd();
  const homedir = options.homedir ?? os.homedir();
  const resolvedManifest = resolveManifestPath(workDir);

  if (!resolvedManifest.exists) {
    throw new Error(`No ${MANIFEST_FILENAME} found. Run this command from a skill directory.`);
  }

  let skillsJson: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(resolvedManifest.path, 'utf-8');
    skillsJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Failed to read or parse ${path.basename(resolvedManifest.path)}`);
  }

  const skillName = skillsJson.name;
  if (typeof skillName !== 'string' || skillName.trim().length === 0) {
    throw new Error(`Missing 'name' in ${path.basename(resolvedManifest.path)}`);
  }

  const description = typeof skillsJson.description === 'string' ? skillsJson.description : undefined;

  const agents = detectInstalledAgents(options.homedir);
  if (agents.length === 0) {
    logger.info('No AI agents detected. Skills linked to agents will be available once agents are installed.');
    return;
  }

  const skillMdPath = path.join(workDir, 'SKILL.md');
  let sourceDir = workDir;

  if (fs.existsSync(skillMdPath)) {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    if (!hasFrontmatter(content)) {
      sourceDir = prepareAgentSkillDir({
        skillName,
        extractDir: workDir,
        agentSkillsBaseDir: getGlobalAgentSkillsDir(homedir),
        description
      });
    }
  } else {
    sourceDir = prepareAgentSkillDir({
      skillName,
      extractDir: workDir,
      agentSkillsBaseDir: getGlobalAgentSkillsDir(homedir),
      description
    });
  }

  void readGlobalLinks(homedir);

  const result = linkSkillToAgents({
    skillName,
    sourceDir,
    linksDir: path.join(homedir, '.tank'),
    source: 'dev',
    homedir: options.homedir
  });

  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));

  for (const agentId of result.linked) {
    logger.success(agentNames.get(agentId) ?? agentId);
  }

  for (const agentId of result.skipped) {
    const name = agentNames.get(agentId) ?? agentId;
    logger.warn(`- ${name} (already linked)`);
  }

  for (const failure of result.failed) {
    const name = agentNames.get(failure.agentId) ?? failure.agentId;
    logger.error(`${name}: ${failure.error}`);
  }

  logger.success(`Linked ${skillName} to ${result.linked.length} agent(s)`);
}

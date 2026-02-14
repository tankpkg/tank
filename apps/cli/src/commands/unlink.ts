import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getGlobalAgentSkillsDir, getSymlinkName } from '../lib/agents.js';
import { unlinkSkillFromAgents } from '../lib/linker.js';
import { logger } from '../lib/logger.js';

export interface UnlinkOptions {
  directory?: string;
  homedir?: string;
}

export async function unlinkCommand(options: UnlinkOptions = {}): Promise<void> {
  const workDir = options.directory ?? process.cwd();
  const skillsJsonPath = path.join(workDir, 'skills.json');

  if (!fs.existsSync(skillsJsonPath)) {
    throw new Error('No skills.json found. Run this command from a skill directory.');
  }

  let skillsJson: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(skillsJsonPath, 'utf-8');
    skillsJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to read or parse skills.json');
  }

  const skillName = skillsJson.name;
  if (typeof skillName !== 'string' || skillName.trim().length === 0) {
    throw new Error("Missing 'name' in skills.json");
  }

  const homedir = options.homedir ?? os.homedir();
  const result = unlinkSkillFromAgents({
    skillName,
    linksDir: path.join(homedir, '.tank'),
    homedir: options.homedir,
  });

  const symlinkName = getSymlinkName(skillName);
  const wrapperDir = path.join(getGlobalAgentSkillsDir(options.homedir), symlinkName);
  if (fs.existsSync(wrapperDir)) {
    fs.rmSync(wrapperDir, { recursive: true, force: true });
  }

  if (result.unlinked.length === 0 && result.notFound.length === 0) {
    logger.info(`No links found for ${skillName}`);
    return;
  }

  logger.success(`Unlinked ${skillName} from ${result.unlinked.length} agent(s)`);
}

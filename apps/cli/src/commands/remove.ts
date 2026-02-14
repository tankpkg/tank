import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type SkillsLock, LOCKFILE_VERSION } from '@tank/shared';
import { logger } from '../lib/logger.js';
import { unlinkSkillFromAgents } from '../lib/linker.js';
import { getSymlinkName, getGlobalSkillsDir, getGlobalAgentSkillsDir } from '../lib/agents.js';

export interface RemoveOptions {
  name: string;
  directory?: string;
  global?: boolean;
  homedir?: string;
}

export async function removeCommand(options: RemoveOptions): Promise<void> {
  const { name, directory = process.cwd(), global, homedir } = options;

  if (global) {
    const resolvedHome = homedir ?? os.homedir();

    // 1. Unlink from agents (failures are warnings)
    try {
      const unlinkResult = unlinkSkillFromAgents({
        skillName: name,
        linksDir: path.join(resolvedHome, '.tank'),
        homedir,
      });
      if (unlinkResult.unlinked.length > 0) {
        logger.info(`Unlinked from ${unlinkResult.unlinked.length} agent(s)`);
      }
    } catch {
      logger.warn('Agent unlinking skipped (non-fatal)');
    }

    // 2. Remove agent-skills wrapper dir
    const symlinkName = getSymlinkName(name);
    const agentSkillDir = path.join(getGlobalAgentSkillsDir(resolvedHome), symlinkName);
    if (fs.existsSync(agentSkillDir)) {
      fs.rmSync(agentSkillDir, { recursive: true, force: true });
    }

    // 3. Remove global skills dir
    const skillDir = getGlobalSkillDir(resolvedHome, name);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }

    // 4. Update global lockfile
    const lockPath = path.join(resolvedHome, '.tank', 'skills.lock');
    if (fs.existsSync(lockPath)) {
      let lock: SkillsLock;
      try {
        const raw = fs.readFileSync(lockPath, 'utf-8');
        lock = JSON.parse(raw) as SkillsLock;
      } catch {
        lock = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
      }

      for (const key of Object.keys(lock.skills)) {
        const lastAt = key.lastIndexOf('@');
        if (lastAt <= 0) continue;
        const keyName = key.slice(0, lastAt);
        if (keyName === name) {
          delete lock.skills[key];
        }
      }

      const sortedSkills: Record<string, unknown> = {};
      for (const key of Object.keys(lock.skills).sort()) {
        sortedSkills[key] = lock.skills[key];
      }
      lock.skills = sortedSkills as SkillsLock['skills'];

      fs.writeFileSync(
        lockPath,
        JSON.stringify(lock, null, 2) + '\n',
      );
    }

    logger.success(`Removed ${name} (global)`);
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

  // 2. Check if skill exists in skills map
  const skills = (skillsJson.skills ?? {}) as Record<string, string>;
  if (!(name in skills)) {
    throw new Error(`Skill "${name}" is not installed (not found in skills.json)`);
  }

  // 3. Remove skill from skills.json
  delete skills[name];
  skillsJson.skills = skills;

  // 4. Write updated skills.json
  fs.writeFileSync(
    skillsJsonPath,
    JSON.stringify(skillsJson, null, 2) + '\n',
  );

  // 5. Read skills.lock if present
  const lockPath = path.join(directory, 'skills.lock');
  if (fs.existsSync(lockPath)) {
    let lock: SkillsLock;
    try {
      const raw = fs.readFileSync(lockPath, 'utf-8');
      lock = JSON.parse(raw) as SkillsLock;
    } catch {
      lock = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
    }

    // 6. Remove ALL lockfile entries for this skill name
    // Key format: name@version — use lastIndexOf('@') to split scoped names
    for (const key of Object.keys(lock.skills)) {
      const lastAt = key.lastIndexOf('@');
      if (lastAt <= 0) continue;
      const keyName = key.slice(0, lastAt);
      if (keyName === name) {
        delete lock.skills[key];
      }
    }

    // 7. Write updated skills.lock (sorted keys, trailing newline)
    const sortedSkills: Record<string, unknown> = {};
    for (const key of Object.keys(lock.skills).sort()) {
      sortedSkills[key] = lock.skills[key];
    }
    lock.skills = sortedSkills as SkillsLock['skills'];

    fs.writeFileSync(
      lockPath,
      JSON.stringify(lock, null, 2) + '\n',
    );
  }

  // 7.5. Unlink from agents (failures are warnings)
  try {
    const unlinkResult = unlinkSkillFromAgents({
      skillName: name,
      linksDir: path.join(directory, '.tank'),
      homedir,
    });
    if (unlinkResult.unlinked.length > 0) {
      logger.info(`Unlinked from ${unlinkResult.unlinked.length} agent(s)`);
    }
  } catch {
    logger.warn('Agent unlinking skipped (non-fatal)');
  }

  // 7.6. Remove agent-skills wrapper dir
  const symlinkName = getSymlinkName(name);
  const agentSkillDir = path.join(directory, '.tank', 'agent-skills', symlinkName);
  if (fs.existsSync(agentSkillDir)) {
    fs.rmSync(agentSkillDir, { recursive: true, force: true });
  }

  // 8. Delete .tank/skills/{name}/ directory
  const skillDir = getSkillDir(directory, name);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }

  // 9. Print success
  logger.success(`Removed ${name}`);
}

function getSkillDir(projectDir: string, skillName: string): string {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(projectDir, '.tank', 'skills', scope, name);
  }
  return path.join(projectDir, '.tank', 'skills', skillName);
}

function getGlobalSkillDir(homedir: string, skillName: string): string {
  const globalDir = getGlobalSkillsDir(homedir);
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(globalDir, scope, name);
  }
  return path.join(globalDir, skillName);
}

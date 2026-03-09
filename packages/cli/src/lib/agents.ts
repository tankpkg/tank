import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export interface AgentInfo {
  id: string;
  name: string;
  skillsDir: string;
}

interface AgentDefinition {
  id: string;
  name: string;
  /** Returns possible config directories in priority order. First is the default. */
  configDirs: (homedir: string) => string[];
}

const resolveHomedir = (homedir?: string): string => homedir ?? os.homedir();

const isWindows = process.platform === 'win32';

export const SUPPORTED_AGENTS: AgentDefinition[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    configDirs: (homedir) => [path.join(homedir, '.claude')]
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    configDirs: (homedir) => {
      const dirs = [path.join(homedir, '.config', 'opencode')];
      if (isWindows) {
        const appData = process.env.APPDATA;
        if (appData) dirs.push(path.join(appData, 'opencode'));
      }
      return dirs;
    }
  },
  {
    id: 'cursor',
    name: 'Cursor',
    configDirs: (homedir) => {
      const dirs = [path.join(homedir, '.cursor')];
      if (isWindows) {
        const appData = process.env.APPDATA;
        if (appData) dirs.push(path.join(appData, 'Cursor'));
      }
      return dirs;
    }
  },
  {
    id: 'codex',
    name: 'Codex',
    configDirs: (homedir) => [path.join(homedir, '.codex')]
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    configDirs: (homedir) => [path.join(homedir, '.openclaw')]
  },
  {
    id: 'universal',
    name: 'Universal',
    configDirs: (homedir) => [path.join(homedir, '.agents')]
  }
];

/**
 * Returns the first existing config directory for an agent,
 * or the first (default) directory if none exist.
 */
function resolveConfigDir(agent: AgentDefinition, homedir: string): string {
  const dirs = agent.configDirs(homedir);
  return dirs.find((d) => fs.existsSync(d)) ?? dirs[0];
}

function isAgentInstalled(agent: AgentDefinition, homedir: string): boolean {
  return agent.configDirs(homedir).some((d) => fs.existsSync(d));
}

export function getSupportedAgents(homedir?: string): AgentInfo[] {
  const resolved = resolveHomedir(homedir);
  return SUPPORTED_AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    skillsDir: path.join(resolveConfigDir(agent, resolved), 'skills')
  }));
}

export function detectInstalledAgents(homedir?: string): AgentInfo[] {
  const resolved = resolveHomedir(homedir);
  return SUPPORTED_AGENTS.filter((agent) => isAgentInstalled(agent, resolved)).map((agent) => ({
    id: agent.id,
    name: agent.name,
    skillsDir: path.join(resolveConfigDir(agent, resolved), 'skills')
  }));
}

export function getAgentSkillDir(agentId: string, homedir?: string): string | null {
  const resolved = resolveHomedir(homedir);
  const agent = SUPPORTED_AGENTS.find((entry) => entry.id === agentId);
  if (!agent) {
    return null;
  }
  return path.join(resolveConfigDir(agent, resolved), 'skills');
}

export function getSymlinkName(skillName: string): string {
  const match = skillName.match(/^@([^/]+)\/(.+)$/);
  if (!match) {
    return skillName;
  }
  const [, scope, name] = match;
  if (scope.length === 0 || name.length === 0) {
    return skillName;
  }
  return `${scope}--${name}`;
}

export function getGlobalSkillsDir(homedir?: string): string {
  return path.join(resolveHomedir(homedir), '.tank', 'skills');
}

export function getGlobalAgentSkillsDir(homedir?: string): string {
  return path.join(resolveHomedir(homedir), '.tank', 'agent-skills');
}

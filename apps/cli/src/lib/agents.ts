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
  skillsDir: (homedir: string) => string;
  configDir: (homedir: string) => string;
}

const resolveHomedir = (homedir?: string): string => homedir ?? os.homedir();

export const SUPPORTED_AGENTS: AgentDefinition[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    skillsDir: (homedir) => path.join(homedir, '.claude', 'skills'),
    configDir: (homedir) => path.join(homedir, '.claude'),
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    skillsDir: (homedir) => path.join(homedir, '.config', 'opencode', 'skills'),
    configDir: (homedir) => path.join(homedir, '.config', 'opencode'),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    skillsDir: (homedir) => path.join(homedir, '.cursor', 'skills'),
    configDir: (homedir) => path.join(homedir, '.cursor'),
  },
  {
    id: 'codex',
    name: 'Codex',
    skillsDir: (homedir) => path.join(homedir, '.codex', 'skills'),
    configDir: (homedir) => path.join(homedir, '.codex'),
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    skillsDir: (homedir) => path.join(homedir, '.openclaw', 'skills'),
    configDir: (homedir) => path.join(homedir, '.openclaw'),
  },
  {
    id: 'universal',
    name: 'Universal',
    skillsDir: (homedir) => path.join(homedir, '.agents', 'skills'),
    configDir: (homedir) => path.join(homedir, '.agents'),
  },
];

export function getSupportedAgents(homedir?: string): AgentInfo[] {
  const resolved = resolveHomedir(homedir);
  return SUPPORTED_AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    skillsDir: agent.skillsDir(resolved),
  }));
}

export function detectInstalledAgents(homedir?: string): AgentInfo[] {
  const resolved = resolveHomedir(homedir);
  return SUPPORTED_AGENTS.filter((agent) => fs.existsSync(agent.configDir(resolved))).map(
    (agent) => ({
      id: agent.id,
      name: agent.name,
      skillsDir: agent.skillsDir(resolved),
    }),
  );
}

export function getAgentSkillDir(agentId: string, homedir?: string): string | null {
  const resolved = resolveHomedir(homedir);
  const agent = SUPPORTED_AGENTS.find((entry) => entry.id === agentId);
  if (!agent) {
    return null;
  }
  return agent.skillsDir(resolved);
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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RewrittenMcpEntry } from './adapter-rewriter.js';

export const AGENT_CONFIG_PATHS: Record<string, readonly string[]> = {
  claude: ['.claude', 'settings.json'],
  cursor: ['.cursor', 'mcp.json'],
  opencode: ['.config', 'opencode', 'mcp.json'],
  codex: ['.codex', 'config.json'],
  openclaw: ['.openclaw', 'mcp.json'],
  universal: ['.config', 'mcp', 'servers.json']
};

export function getAgentConfigPath(agentId: string, homedir?: string): string | null {
  const segments = AGENT_CONFIG_PATHS[agentId];
  if (!segments) return null;
  const base = homedir ?? os.homedir();
  return path.join(base, ...segments);
}

export interface WriteEntryOptions {
  agentId: string;
  skillName: string;
  homedir?: string;
  entry?: RewrittenMcpEntry;
  remove?: boolean;
}

interface AgentConfigShape {
  mcpServers?: Record<string, RewrittenMcpEntry>;
  [key: string]: unknown;
}

function readConfigOrEmpty(configPath: string): AgentConfigShape {
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as AgentConfigShape;
  } catch {
    return {};
  }
}

function persistConfig(configPath: string, config: AgentConfigShape): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

export function writeMcpServerEntry(options: WriteEntryOptions): void {
  const configPath = getAgentConfigPath(options.agentId, options.homedir);
  if (!configPath) throw new Error(`unknown agent: ${options.agentId}`);

  const existing = readConfigOrEmpty(configPath);
  const mcpServers = { ...(existing.mcpServers ?? {}) };

  if (options.remove) {
    if (!(options.skillName in mcpServers)) {
      if (!fs.existsSync(configPath)) return;
    }
    delete mcpServers[options.skillName];
  } else {
    if (!options.entry) throw new Error('writeMcpServerEntry: entry is required when remove=false');
    mcpServers[options.skillName] = options.entry;
  }

  persistConfig(configPath, { ...existing, mcpServers });
}

export type ProxyStrategy = 'node-options' | 'https-proxy' | 'base-url-overrides' | 'best-effort';

export interface AgentRunConfig {
  id: string;
  name: string;
  runtime: 'node' | 'bun' | 'electron' | 'rust' | 'unknown';
  strategy: ProxyStrategy;
  command: string;
}

export const AGENT_CONFIGS: AgentRunConfig[] = [
  {
    id: 'claude',
    name: 'Claude',
    runtime: 'node',
    strategy: 'base-url-overrides',
    command: 'claude'
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    runtime: 'bun',
    strategy: 'base-url-overrides',
    command: 'opencode'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    runtime: 'electron',
    strategy: 'https-proxy',
    command: 'cursor'
  },
  {
    id: 'codex',
    name: 'Codex',
    runtime: 'rust',
    strategy: 'https-proxy',
    command: 'codex'
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    runtime: 'unknown',
    strategy: 'best-effort',
    command: 'openclaw'
  },
  {
    id: 'universal',
    name: 'Universal',
    runtime: 'unknown',
    strategy: 'best-effort',
    command: 'universal'
  }
];

export function getAgentConfig(agentId: string): AgentRunConfig | undefined {
  return AGENT_CONFIGS.find((config) => config.id === agentId);
}

export function getSupportedAgentIds(): string[] {
  return AGENT_CONFIGS.map((config) => config.id);
}

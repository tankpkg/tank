import type { ProxyServer } from '../proxy/server.ts';
import type { VaultStore } from '../tokenizer/vault.ts';

export interface RunResult {
  exitCode: number;
  proxy: ProxyServer;
  vault: VaultStore;
}

export interface RunOptions {
  agentId: string;
  agentArgs?: string[];
  verbose?: boolean;
  prescan?: boolean;
  onOutput?: (line: string) => void;
}

export async function run(_options: RunOptions): Promise<RunResult> {
  throw new Error('Not implemented');
}

export function buildAgentEnv(
  strategy: string,
  proxyUrl: string,
  existingEnv: Record<string, string | undefined>
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...existingEnv };
  const bootstrapRequire = '--require tank-vault-proxy-bootstrap.js';

  const setNodeOptions = () => {
    const existingNodeOptions = env.NODE_OPTIONS?.trim();
    env.NODE_OPTIONS = existingNodeOptions ? `${existingNodeOptions} ${bootstrapRequire}` : bootstrapRequire;
  };

  switch (strategy) {
    case 'node-options': {
      setNodeOptions();
      env.HTTPS_PROXY = proxyUrl;
      env.HTTP_PROXY = proxyUrl;
      env.TANK_VAULT_PROXY_URL = proxyUrl;
      break;
    }
    case 'https-proxy': {
      env.HTTPS_PROXY = proxyUrl;
      env.HTTP_PROXY = proxyUrl;
      break;
    }
    case 'base-url-overrides': {
      env.TANK_VAULT_UPSTREAM_ANTHROPIC = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
      env.TANK_VAULT_UPSTREAM_OPENAI = env.OPENAI_BASE_URL || 'https://api.openai.com';
      env.ANTHROPIC_BASE_URL = proxyUrl;
      env.OPENAI_BASE_URL = proxyUrl;
      env.HTTPS_PROXY = proxyUrl;
      env.TANK_VAULT_PROXY_URL = proxyUrl;
      break;
    }
    case 'best-effort': {
      setNodeOptions();
      env.TANK_VAULT_UPSTREAM_ANTHROPIC = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
      env.TANK_VAULT_UPSTREAM_OPENAI = env.OPENAI_BASE_URL || 'https://api.openai.com';
      env.HTTPS_PROXY = proxyUrl;
      env.HTTP_PROXY = proxyUrl;
      env.ANTHROPIC_BASE_URL = proxyUrl;
      env.OPENAI_BASE_URL = proxyUrl;
      env.TANK_VAULT_PROXY_URL = proxyUrl;
      break;
    }
    default: {
      break;
    }
  }

  return env;
}

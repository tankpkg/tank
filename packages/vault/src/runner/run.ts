import type { ProxyServer } from '../proxy/server.ts';
import { encodeUpstreamUrl } from '../proxy/server.ts';
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

const KNOWN_BASE_URL_VARS = [
  { envVar: 'ANTHROPIC_BASE_URL', defaultUrl: 'https://api.anthropic.com' },
  { envVar: 'OPENAI_BASE_URL', defaultUrl: 'https://api.openai.com' },
  { envVar: 'MISTRAL_BASE_URL', defaultUrl: 'https://api.mistral.ai' },
  { envVar: 'GROQ_BASE_URL', defaultUrl: 'https://api.groq.com/openai' }
];

export function buildAgentEnv(
  strategy: string,
  proxyUrl: string,
  existingEnv: Record<string, string | undefined>
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...existingEnv };
  const bootstrapRequire = '--require tank-vault-proxy-bootstrap.js';

  const setNodeOptions = () => {
    const existing = env.NODE_OPTIONS?.trim();
    env.NODE_OPTIONS = existing ? `${existing} ${bootstrapRequire}` : bootstrapRequire;
  };

  const overrideBaseUrls = () => {
    for (const { envVar, defaultUrl } of KNOWN_BASE_URL_VARS) {
      const originalUrl = env[envVar] || defaultUrl;
      env[envVar] = proxyUrl + encodeUpstreamUrl(originalUrl);
    }
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
      overrideBaseUrls();
      env.TANK_VAULT_PROXY_URL = proxyUrl;
      break;
    }
    case 'best-effort': {
      setNodeOptions();
      overrideBaseUrls();
      env.HTTPS_PROXY = proxyUrl;
      env.HTTP_PROXY = proxyUrl;
      env.TANK_VAULT_PROXY_URL = proxyUrl;
      break;
    }
    default: {
      break;
    }
  }

  return env;
}

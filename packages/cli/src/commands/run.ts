import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';

export interface RunOptions {
  agent: string;
  verbose?: boolean;
  agentArgs?: string[];
}

interface AgentConfig {
  id: string;
  name: string;
  runtime: string;
  strategy: string;
  command: string;
}

interface VaultStoreLike {
  clear: () => void;
}

interface ProxyServerLike {
  port: number;
  url: string;
  close: () => Promise<void>;
}

type BuildAgentEnvFn = (
  strategy: string,
  proxyUrl: string,
  existingEnv: Record<string, string | undefined>
) => Record<string, string | undefined>;

type GetAgentConfigFn = (agentId: string) => AgentConfig | undefined;
type GetSupportedAgentIdsFn = () => string[];
type StartProxyFn = (vault: VaultStoreLike) => Promise<ProxyServerLike>;
type VaultCtor = new () => VaultStoreLike;

const AGENTS_MODULE = '@tankpkg/vault/src/runner/agents';
const RUNNER_MODULE = '@tankpkg/vault/src/runner/run';
const SERVER_MODULE = '@tankpkg/vault/src/proxy/server';
const VAULT_MODULE = '@tankpkg/vault/src/tokenizer/vault';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_PATH = path.resolve(__dirname, '..', '..', '..', 'vault', 'src', 'proxy', 'bootstrap.cjs');
const PLACEHOLDER_REQUIRE = '--require tank-vault-proxy-bootstrap.js';

export async function runCommand(options: RunOptions): Promise<void> {
  const [agentsModule, runnerModule, serverModule, vaultModule] = await Promise.all([
    import(AGENTS_MODULE),
    import(RUNNER_MODULE),
    import(SERVER_MODULE),
    import(VAULT_MODULE)
  ]);

  const { getAgentConfig, getSupportedAgentIds } = agentsModule as {
    getAgentConfig: GetAgentConfigFn;
    getSupportedAgentIds: GetSupportedAgentIdsFn;
  };
  const { buildAgentEnv } = runnerModule as { buildAgentEnv: BuildAgentEnvFn };
  const { startProxy } = serverModule as { startProxy: StartProxyFn };
  const { VaultStore } = vaultModule as { VaultStore: VaultCtor };

  const config = getAgentConfig(options.agent);
  if (!config) {
    const supported = getSupportedAgentIds().join(', ');
    console.error(chalk.red(`Unknown agent: ${options.agent}`));
    console.error(`Supported agents: ${supported}`);
    process.exit(1);
  }

  const vault = new VaultStore();
  const proxy = await startProxy(vault);

  console.log(`Vault proxy started on port ${proxy.port}`);
  console.log(`Agent: ${config.name} (${config.runtime})`);
  console.log('Credentials will be detected from traffic');

  const env = buildAgentEnv(config.strategy, proxy.url, process.env);
  const bootstrapRequire = `--require ${BOOTSTRAP_PATH}`;
  if (env.NODE_OPTIONS?.includes(PLACEHOLDER_REQUIRE)) {
    env.NODE_OPTIONS = env.NODE_OPTIONS.replace(PLACEHOLDER_REQUIRE, bootstrapRequire);
  }

  if (options.verbose) {
    console.log(`Bootstrap: ${BOOTSTRAP_PATH}`);
    console.log(`Proxy URL: ${proxy.url}`);
  }

  const child = spawn(config.command, options.agentArgs ?? [], {
    env,
    stdio: 'inherit'
  });

  let cleaningUp = false;
  const cleanupAndExit = async (code: number): Promise<void> => {
    if (cleaningUp) {
      return;
    }
    cleaningUp = true;
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    vault.clear();
    await proxy.close();
    process.exit(code);
  };

  const onSigint = (): void => {
    child.kill('SIGINT');
  };

  const onSigterm = (): void => {
    child.kill('SIGTERM');
  };

  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  child.once('error', async (error) => {
    console.error(chalk.red(`Failed to launch agent: ${error.message}`));
    await cleanupAndExit(1);
  });

  child.once('exit', async (code, signal) => {
    const exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
    await cleanupAndExit(exitCode);
  });
}

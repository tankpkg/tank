import chalk from 'chalk';

export interface ProxyCommandOptions {
  command: string;
  args: string[];
  auditPath?: string;
  verbose?: boolean;
  enableMl?: boolean;
}

interface ProxyHandleLike {
  exitCode: Promise<number>;
  kill(signal?: NodeJS.Signals): void;
}

interface StartProxyOptions {
  command: string;
  args: string[];
  auditPath?: string;
  enableMl?: boolean;
}

type StartProxyFn = (opts: StartProxyOptions) => Promise<ProxyHandleLike>;

const PROXY_MODULE = '@tankpkg/proxy';

export async function proxyCommand(options: ProxyCommandOptions): Promise<void> {
  if (!options.command || options.command.length === 0) {
    throw new Error('tank proxy: missing child command (usage: tank proxy -- <command> [args...])');
  }

  const proxyModule = (await import(PROXY_MODULE)) as { startProxy: StartProxyFn };
  const { startProxy } = proxyModule;

  if (options.verbose) {
    console.error(chalk.dim(`[tank proxy] spawning: ${options.command} ${options.args.join(' ')}`));
  }

  const startOptions: StartProxyOptions = {
    command: options.command,
    args: options.args
  };
  if (options.auditPath !== undefined) startOptions.auditPath = options.auditPath;
  if (options.enableMl === true) startOptions.enableMl = true;

  const handle = await startProxy(startOptions);

  const forwardSignal = (signal: NodeJS.Signals): void => {
    try {
      handle.kill(signal);
    } catch {
      // child may already be gone — swallow
    }
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  const code = await handle.exitCode;
  process.exit(code);
}

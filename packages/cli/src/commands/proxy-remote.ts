export interface ProxyRemoteOptions {
  url: string;
  requiresAuth: boolean;
  env?: Record<string, string | undefined>;
  exit?: boolean;
}

export interface ProxyRemoteResult {
  exitCode: number;
}

interface ProxyApi {
  startProxy(options: {
    command: string;
    args: string[];
    remote: { url: string; requiresAuth: boolean; env?: Record<string, string | undefined> };
    auditPath?: string;
  }): Promise<{
    exitCode: Promise<number>;
    kill(signal?: NodeJS.Signals): void;
  }>;
}

const PROXY_MODULE = '@tankpkg/proxy';

function writeLine(line: string): void {
  process.stderr.write(`${line}\n`);
}

function finalize(code: number, shouldExit?: boolean): ProxyRemoteResult {
  if (shouldExit !== false) process.exit(code);
  return { exitCode: code };
}

export async function proxyRemoteCommand(options: ProxyRemoteOptions): Promise<ProxyRemoteResult> {
  const env = options.env ?? process.env;
  const proxyModule = (await import(PROXY_MODULE)) as ProxyApi;

  let handle: Awaited<ReturnType<ProxyApi['startProxy']>>;
  try {
    handle = await proxyModule.startProxy({
      command: '(remote)',
      args: [],
      remote: {
        url: options.url,
        requiresAuth: options.requiresAuth,
        env
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const exitCode = (err as { exitCode?: number }).exitCode ?? 1;
    if (!msg.startsWith('tank proxy:')) writeLine(`tank proxy: ${msg}`);
    return finalize(exitCode, options.exit);
  }

  const forwardSignal = (signal: NodeJS.Signals): void => {
    try {
      handle.kill(signal);
    } catch {
      return;
    }
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  const code = await handle.exitCode;
  return finalize(code, options.exit);
}

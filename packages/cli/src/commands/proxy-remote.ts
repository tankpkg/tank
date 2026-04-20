export interface ProxyRemoteOptions {
  url: string;
  requiresAuth: boolean;
  env?: Record<string, string | undefined>;
  envVarName?: string;
  exit?: boolean;
}

export interface ProxyRemoteResult {
  exitCode: number;
}

interface RemoteTransportApi {
  validateRemoteProxyEnv(input: {
    url: string;
    requiresAuth: boolean;
    env: Record<string, string | undefined>;
    envVarName?: string;
  }): { ok: true } | { ok: false; exitCode: 2; message: string; missingVar: string };
}

const PROXY_MODULE = '@tankpkg/proxy';

function writeLine(line: string): void {
  process.stderr.write(`${line}\n`);
}

export async function proxyRemoteCommand(options: ProxyRemoteOptions): Promise<ProxyRemoteResult> {
  const env = options.env ?? process.env;
  const proxyModule = (await import(PROXY_MODULE)) as RemoteTransportApi;
  const validateOptions: Parameters<RemoteTransportApi['validateRemoteProxyEnv']>[0] = {
    url: options.url,
    requiresAuth: options.requiresAuth,
    env
  };
  if (options.envVarName !== undefined) validateOptions.envVarName = options.envVarName;

  let validation: ReturnType<RemoteTransportApi['validateRemoteProxyEnv']>;
  try {
    validation = proxyModule.validateRemoteProxyEnv(validateOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeLine(`tank proxy: ${msg}`);
    return finalize(1, options.exit);
  }

  if (!validation.ok) {
    writeLine(validation.message);
    return finalize(validation.exitCode, options.exit);
  }

  writeLine(
    `tank proxy: remote MCP transport is not yet shipped (scheduled for Phase 7); env validation passed for ${options.url}`
  );
  return finalize(0, options.exit);
}

function finalize(code: number, shouldExit?: boolean): ProxyRemoteResult {
  if (shouldExit !== false) process.exit(code);
  return { exitCode: code };
}

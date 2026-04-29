export interface ProxyDownloadMlOptions {
  yes?: boolean;
  modelsDir?: string;
  exit?: boolean;
  confirm?: (message: string) => Promise<boolean>;
}

export interface ProxyDownloadMlResult {
  exitCode: number;
}

interface DownloadApi {
  downloadModel(options: {
    modelsDir?: string;
    assumeYes?: boolean;
    skipDownload?: boolean;
    writePlaceholder?: boolean;
    confirm?: (message: string) => Promise<boolean>;
  }): Promise<{
    status: 'scaffold' | 'declined' | 'already-installed';
    message: string;
    modelPath: string;
  }>;
}

const PROXY_MODULE = '@tankpkg/proxy';

function writeLine(line: string): void {
  process.stderr.write(`${line}\n`);
}

async function defaultConfirm(message: string): Promise<boolean> {
  const { confirm } = (await import('@inquirer/prompts')) as {
    confirm: (opts: { message: string; default?: boolean }) => Promise<boolean>;
  };
  return confirm({ message, default: false });
}

function finalize(code: number, shouldExit?: boolean): ProxyDownloadMlResult {
  if (shouldExit !== false) process.exit(code);
  return { exitCode: code };
}

export async function proxyDownloadMlCommand(options: ProxyDownloadMlOptions): Promise<ProxyDownloadMlResult> {
  const proxy = (await import(PROXY_MODULE)) as DownloadApi;

  const downloadOptions: Parameters<DownloadApi['downloadModel']>[0] = {
    assumeYes: options.yes === true,
    skipDownload: true,
    writePlaceholder: true
  };
  if (options.modelsDir !== undefined) downloadOptions.modelsDir = options.modelsDir;
  if (options.yes !== true) {
    downloadOptions.confirm = options.confirm ?? defaultConfirm;
  }

  let outcome: Awaited<ReturnType<DownloadApi['downloadModel']>>;
  try {
    outcome = await proxy.downloadModel(downloadOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeLine(`tank proxy: ${msg}`);
    return finalize(1, options.exit);
  }

  writeLine(outcome.message);
  return finalize(outcome.status === 'declined' ? 1 : 0, options.exit);
}

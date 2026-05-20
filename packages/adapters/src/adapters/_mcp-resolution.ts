import type { AtomIR } from '@internals/schemas';

export interface ResolvedMcp {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export function resolveMcpCommand(atom: AtomIR & { kind: 'tool' }, adapterName: string): ResolvedMcp | null {
  if (atom.mcp) {
    return resolveFromMcpBlock(atom.mcp);
  }
  const fromExtensions = resolveFromExtensions(atom.extensions, adapterName);
  if (fromExtensions) return fromExtensions;
  return null;
}

function resolveFromMcpBlock(mcp: NonNullable<(AtomIR & { kind: 'tool' })['mcp']>): ResolvedMcp | null {
  const env = mcp.env;
  if (mcp.command) {
    return { command: mcp.command, args: mcp.args ?? [], ...(env ? { env } : {}) };
  }
  if (!mcp.runtime) return null;

  const args = mcp.args ?? [];
  switch (mcp.runtime) {
    case 'uvx':
      if (!mcp.package) return null;
      return { command: 'uvx', args: [mcp.package, ...args], ...(env ? { env } : {}) };
    case 'npx':
      if (!mcp.package) return null;
      return { command: 'npx', args: ['-y', mcp.package, ...args], ...(env ? { env } : {}) };
    case 'bunx':
      if (!mcp.package) return null;
      return { command: 'bunx', args: [mcp.package, ...args], ...(env ? { env } : {}) };
    case 'pipx':
      if (!mcp.package) return null;
      return { command: 'pipx', args: ['run', mcp.package, ...args], ...(env ? { env } : {}) };
    case 'node':
      if (!mcp.entry) return null;
      return { command: 'node', args: [mcp.entry, ...args], ...(env ? { env } : {}) };
    case 'python':
      if (!mcp.entry) return null;
      return { command: 'python', args: [mcp.entry, ...args], ...(env ? { env } : {}) };
    default:
      return null;
  }
}

function resolveFromExtensions(
  extensions: (AtomIR & { kind: 'tool' })['extensions'],
  adapterName: string
): ResolvedMcp | null {
  if (!extensions) return null;
  const bag = extensions[adapterName];
  if (!bag || typeof bag !== 'object') return null;
  const candidate = bag as Record<string, unknown>;
  if (typeof candidate.command !== 'string' || candidate.command.length === 0) return null;
  const args = Array.isArray(candidate.args) ? candidate.args.filter((a): a is string => typeof a === 'string') : [];
  const env =
    candidate.env && typeof candidate.env === 'object' && !Array.isArray(candidate.env)
      ? Object.fromEntries(
          Object.entries(candidate.env as Record<string, unknown>).filter(([, v]) => typeof v === 'string') as [
            string,
            string
          ][]
        )
      : undefined;
  return { command: candidate.command, args, ...(env ? { env } : {}) };
}

import { type McpServer, isRemoteMcpServer } from '@internals/schemas';

export interface RewrittenMcpEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface RewriteOptions {
  skillName: string;
  mcpServer: McpServer;
  tankBinaryPath?: string;
  dangerouslyNoTankProxy?: boolean;
}

const DEFAULT_TANK_BINARY = 'tank';

function passthroughEntry(server: McpServer): RewrittenMcpEntry {
  if (isRemoteMcpServer(server)) {
    throw new Error('adapter-rewriter: opt-out is not supported for remote MCP servers (requires proxy transport)');
  }
  const entry: RewrittenMcpEntry = { command: server.command, args: [...server.args] };
  if (server.env) entry.env = { ...server.env };
  return entry;
}

function wrapLocal(
  server: { command: string; args: string[]; env?: Record<string, string> },
  binary: string
): RewrittenMcpEntry {
  const entry: RewrittenMcpEntry = {
    command: binary,
    args: ['proxy', '--', server.command, ...server.args]
  };
  if (server.env) entry.env = { ...server.env };
  return entry;
}

export function rewriteMcpServerEntry(options: RewriteOptions): RewrittenMcpEntry {
  const binary = options.tankBinaryPath ?? DEFAULT_TANK_BINARY;
  if (options.dangerouslyNoTankProxy) return passthroughEntry(options.mcpServer);
  if (isRemoteMcpServer(options.mcpServer)) {
    throw new Error('adapter-rewriter: remote MCP servers are handled by rewriteRemoteMcpServerEntry (Phase 6 step 3)');
  }
  return wrapLocal(options.mcpServer, binary);
}

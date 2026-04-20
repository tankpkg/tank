import { type McpServer, type McpServerRemote, isRemoteMcpServer } from '@internals/schemas';

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
const AUTH_ENV_VAR_PREFIX = 'TANK_MCP_AUTH_';
const AUTH_PLACEHOLDER_VALUE = '<agent-config-resolves-this>';

export function deriveAuthEnvVarName(skillName: string): string {
  const lastSlash = skillName.lastIndexOf('/');
  const baseName = lastSlash === -1 ? skillName : skillName.slice(lastSlash + 1);
  const sanitized = baseName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${AUTH_ENV_VAR_PREFIX}${sanitized.toUpperCase()}`;
}

function passthroughEntry(server: McpServer): RewrittenMcpEntry {
  if (isRemoteMcpServer(server)) {
    throw new Error('adapter-rewriter: remote MCP servers cannot opt out (proxy transport is mandatory for remote)');
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

function wrapRemote(skillName: string, server: McpServerRemote, binary: string): RewrittenMcpEntry {
  const entry: RewrittenMcpEntry = {
    command: binary,
    args: ['proxy', '--remote', server.remote]
  };
  const mergedEnv: Record<string, string> = { ...(server.env ?? {}) };
  if (server.requires_auth) {
    mergedEnv[deriveAuthEnvVarName(skillName)] = AUTH_PLACEHOLDER_VALUE;
  }
  if (Object.keys(mergedEnv).length > 0) entry.env = mergedEnv;
  return entry;
}

export function rewriteMcpServerEntry(options: RewriteOptions): RewrittenMcpEntry {
  const binary = options.tankBinaryPath ?? DEFAULT_TANK_BINARY;
  if (options.dangerouslyNoTankProxy) return passthroughEntry(options.mcpServer);
  if (isRemoteMcpServer(options.mcpServer)) return wrapRemote(options.skillName, options.mcpServer, binary);
  return wrapLocal(options.mcpServer, binary);
}

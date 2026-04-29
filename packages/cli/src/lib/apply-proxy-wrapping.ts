import fs from 'node:fs';
import path from 'node:path';
import { mcpServerSchema } from '@internals/schemas';
import { rewriteMcpServerEntry } from './adapter-rewriter.js';
import { AGENT_CONFIG_PATHS, writeMcpServerEntry } from './mcp-config-writer.js';

export type SkipReason = 'no-manifest' | 'invalid-manifest' | 'no-mcp-server' | 'invalid-mcp-server';

export interface ApplyProxyWrappingResult {
  wrapped: string[];
  skipped: SkipReason[];
}

export interface ApplyProxyWrappingOptions {
  skillName: string;
  skillDir: string;
  agentIds: string[];
  homedir?: string;
  tankBinaryPath?: string;
  dangerouslyNoTankProxy?: boolean;
  remove?: boolean;
}

function readManifest(skillDir: string): Record<string, unknown> | 'missing' | 'invalid' {
  const manifestPath = path.join(skillDir, 'tank.json');
  if (!fs.existsSync(manifestPath)) return 'missing';
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return 'invalid';
    return parsed as Record<string, unknown>;
  } catch {
    return 'invalid';
  }
}

function warnOptOut(skillName: string): void {
  console.warn(`Proxy disabled for ${skillName} — MCP traffic will not be scanned`);
}

function isKnownAgent(agentId: string): boolean {
  return agentId in AGENT_CONFIG_PATHS;
}

function applyRemoval(options: ApplyProxyWrappingOptions): ApplyProxyWrappingResult {
  const wrapped: string[] = [];
  for (const agentId of options.agentIds) {
    if (!isKnownAgent(agentId)) continue;
    writeMcpServerEntry({
      agentId,
      skillName: options.skillName,
      remove: true,
      homedir: options.homedir
    });
    wrapped.push(agentId);
  }
  return { wrapped, skipped: [] };
}

export function applyProxyWrapping(options: ApplyProxyWrappingOptions): ApplyProxyWrappingResult {
  if (options.remove) return applyRemoval(options);

  const manifest = readManifest(options.skillDir);
  if (manifest === 'missing') return { wrapped: [], skipped: ['no-manifest'] };
  if (manifest === 'invalid') return { wrapped: [], skipped: ['invalid-manifest'] };

  const rawMcpServer = manifest.mcp_server;
  if (rawMcpServer === undefined) return { wrapped: [], skipped: ['no-mcp-server'] };

  const parseResult = mcpServerSchema.safeParse(rawMcpServer);
  if (!parseResult.success) return { wrapped: [], skipped: ['invalid-mcp-server'] };

  const rewriteOptions: Parameters<typeof rewriteMcpServerEntry>[0] = {
    skillName: options.skillName,
    mcpServer: parseResult.data,
    ...(options.tankBinaryPath !== undefined ? { tankBinaryPath: options.tankBinaryPath } : {}),
    ...(options.dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
  };
  const entry = rewriteMcpServerEntry(rewriteOptions);

  if (options.dangerouslyNoTankProxy) warnOptOut(options.skillName);

  const wrapped: string[] = [];
  for (const agentId of options.agentIds) {
    if (!isKnownAgent(agentId)) continue;
    writeMcpServerEntry({
      agentId,
      skillName: options.skillName,
      entry,
      homedir: options.homedir
    });
    wrapped.push(agentId);
  }
  return { wrapped, skipped: [] };
}

import { pinOrCompare, type ToolSchema } from '../scanner/rug-pull.ts';
import { scanToolDescription } from '../scanner/tool-poisoning.ts';
import type { JsonRpcMessage } from './message-router.ts';

export interface AuditHookEntry {
  method: string;
  verdict: 'pass' | 'block';
  toolName?: string;
  reason?: string;
}

export interface InterceptorContext {
  packageHash: string;
  pinsDir: string;
  blockOnMatch: boolean;
  onAudit: (entry: AuditHookEntry) => void;
}

export interface BlockedTool {
  toolName: string;
  reason: 'poisoning_detected' | 'rug_pull_detected';
}

export interface InterceptResult {
  outbound: JsonRpcMessage;
  blockedTools: BlockedTool[];
}

function toolsFromResult(result: unknown): ToolSchema[] | null {
  if (result === null || typeof result !== 'object') return null;
  const candidate = (result as { tools?: unknown }).tools;
  if (!Array.isArray(candidate)) return null;
  return candidate.filter(isToolSchema);
}

function isToolSchema(value: unknown): value is ToolSchema {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as ToolSchema).name === 'string' &&
    typeof (value as ToolSchema).description === 'string'
  );
}

function scanAllDescriptions(tools: readonly ToolSchema[]): Set<string> {
  const poisoned = new Set<string>();
  for (const tool of tools) {
    if (scanToolDescription(tool.description).matched) {
      poisoned.add(tool.name);
    }
  }
  return poisoned;
}

function detectRugPulledNames(tools: readonly ToolSchema[], ctx: InterceptorContext): Set<string> {
  const result = pinOrCompare(ctx.packageHash, tools, { pinsDir: ctx.pinsDir });
  if (result.verdict !== 'mismatch') return new Set();
  return new Set(result.mismatches.map((m) => m.toolName));
}

function emitAuditBlock(ctx: InterceptorContext, toolName: string, reason: string): void {
  ctx.onAudit({ method: 'tools/list', verdict: 'block', toolName, reason });
}

export function interceptToolsListResponse(
  method: string,
  message: JsonRpcMessage,
  ctx: InterceptorContext
): InterceptResult {
  if (method !== 'tools/list') return { outbound: message, blockedTools: [] };
  const tools = toolsFromResult(message.result);
  if (tools === null) return { outbound: message, blockedTools: [] };

  const poisoned = scanAllDescriptions(tools);
  const rugPulled = detectRugPulledNames(tools, ctx);
  const blockedTools: BlockedTool[] = [];
  for (const name of poisoned) {
    emitAuditBlock(ctx, name, 'poisoning_detected');
    blockedTools.push({ toolName: name, reason: 'poisoning_detected' });
  }
  for (const name of rugPulled) {
    if (poisoned.has(name)) continue;
    emitAuditBlock(ctx, name, 'rug_pull_detected');
    blockedTools.push({ toolName: name, reason: 'rug_pull_detected' });
  }

  if (!ctx.blockOnMatch || blockedTools.length === 0) {
    return { outbound: message, blockedTools };
  }
  const blockedNames = new Set(blockedTools.map((b) => b.toolName));
  const filtered = tools.filter((t) => !blockedNames.has(t.name));
  const outbound: JsonRpcMessage = {
    ...message,
    result: { ...(message.result as object), tools: filtered }
  };
  return { outbound, blockedTools };
}

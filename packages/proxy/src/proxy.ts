import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { isPathAllowedWithRealpath } from '@internals/helpers';
import { type AuditLogger, createAuditLogger } from './audit/logger.ts';
import { type EnforcementBudget, loadEnforcementBudget } from './enforcer/manifest-loader.ts';
import { evaluatePermissionGate } from './enforcer/permission-gate.ts';
import { injectCanary } from './scanner/canary-inject.ts';
import { CanarySession } from './scanner/canary-session.ts';
import { computePinIdentity } from './scanner/pin-identity.ts';
import { interceptToolCallResponse } from './transport/canary-interceptor.ts';
import {
  interceptPromptGetResponse,
  interceptPromptsListResponse,
  interceptResourceReadResponse,
  interceptResourcesListResponse
} from './transport/resources-prompts-interceptor.ts';
import { framingError, parseJsonRpcMessage } from './transport/message-router.ts';
import { resolveCommandPath } from './transport/resolve-command.ts';
import { interceptToolsListResponse } from './transport/scan-interceptor.ts';
import { type StdioChildHandle, spawnChild } from './transport/stdio-wrapper.ts';

export interface ProxyOptions {
  command: string;
  args: string[];
  auditPath?: string;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  allowlist?: string[];
  pinsDir?: string;
  blockOnMatch?: boolean;
  manifestCwd?: string;
  permissionBudget?: EnforcementBudget | null;
}

export interface ProxyHandle {
  exitCode: Promise<number>;
  kill(signal?: NodeJS.Signals): void;
}

const DEFAULT_AUDIT_PATH = join(homedir(), '.tank', 'proxy', 'audit.jsonl');
const DEFAULT_PINS_DIR = join(homedir(), '.tank', 'proxy', 'pins');

function resolveBudget(options: ProxyOptions): EnforcementBudget | null {
  if (options.permissionBudget !== undefined) return options.permissionBudget;
  const cwd = options.manifestCwd ?? process.cwd();
  return loadEnforcementBudget(cwd).budget;
}

function defaultAllowlist(): string[] {
  const pathDirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  return [
    ...pathDirs.map((d) => `${d}/**`),
    `${join(homedir(), '.tank')}/**`,
    `${join(process.cwd(), 'node_modules', '.bin')}/**`
  ];
}

export async function startProxy(options: ProxyOptions): Promise<ProxyHandle> {
  const auditPath = options.auditPath ?? DEFAULT_AUDIT_PATH;
  const logger: AuditLogger = createAuditLogger(auditPath);
  const agentStdin: NodeJS.ReadableStream = options.stdin ?? process.stdin;
  const agentStdout: NodeJS.WritableStream = options.stdout ?? process.stdout;
  const pinsDir = options.pinsDir ?? DEFAULT_PINS_DIR;
  const blockOnMatch = options.blockOnMatch ?? true;
  const packageHash = computePinIdentity([options.command, ...options.args]);
  const budget = resolveBudget(options);

  const resolvedCommand = resolveCommandPath(options.command);
  const allowlist = options.allowlist ?? defaultAllowlist();
  const allowed = await isPathAllowedWithRealpath(resolvedCommand, allowlist);
  if (!allowed) {
    throw new Error(`proxy: command path not allowed: ${options.command}`);
  }

  const child: StdioChildHandle = spawnChild(resolvedCommand, options.args);
  const pendingRequests = new Map<string | number, { method: string; toolName?: string }>();
  const canarySession = new CanarySession();

  let exitResolve: (code: number) => void = () => {};
  const exitCode = new Promise<number>((resolve) => {
    exitResolve = resolve;
  });

  child.onMessage((line) => {
    handleOutbound(line);
  });

  child.onExit((code) => {
    exitResolve(code);
  });

  let inboundBuffer = '';
  const stdinWithEncoding = agentStdin as NodeJS.ReadableStream & {
    setEncoding?: (enc: BufferEncoding) => unknown;
  };
  stdinWithEncoding.setEncoding?.('utf8');
  agentStdin.on('data', (chunk: string | Buffer) => {
    inboundBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let newlineIndex = inboundBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = inboundBuffer.slice(0, newlineIndex);
      inboundBuffer = inboundBuffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        handleInbound(line);
      }
      newlineIndex = inboundBuffer.indexOf('\n');
    }
  });

  function handleInbound(line: string): void {
    void handleInboundAsync(line);
  }

  async function handleInboundAsync(line: string): Promise<void> {
    const parsed = parseJsonRpcMessage(line);
    if (!parsed.ok) {
      agentStdout.write(framingError(parsed.code, parsed.message, parsed.id));
      void logger.append({ method: 'invalid', verdict: 'block', reason: parsed.message });
      return;
    }
    const method = parsed.message.method ?? 'unknown';
    const toolName = extractToolName(parsed.message);
    if (method === 'tools/call' && toolName !== undefined) {
      const blocked = await enforceToolCallPermissions(parsed.message, toolName);
      if (blocked) return;
    }
    const entry: { method: string; verdict: 'pass' | 'block'; tool_name?: string } = {
      method,
      verdict: 'pass'
    };
    if (toolName !== undefined) entry.tool_name = toolName;
    void logger.append(entry);
    if (parsed.message.id !== undefined && parsed.message.id !== null) {
      const pending: { method: string; toolName?: string } = { method };
      if (toolName !== undefined) pending.toolName = toolName;
      pendingRequests.set(parsed.message.id, pending);
    }
    const outboundToChild = rewriteWithCanary(parsed.message, parsed.raw, method, toolName);
    child.write(outboundToChild);
  }

  function rewriteWithCanary(
    message: JsonRpcMessageRef,
    raw: string,
    method: string,
    toolName: string | undefined
  ): string {
    if (method !== 'tools/call' || toolName === undefined) return raw;
    const canary = canarySession.mint(toolName);
    const params = (message.params as { arguments?: unknown } & Record<string, unknown>) ?? {};
    const injected = injectCanary(params.arguments, canary);
    const nextParams = { ...params, arguments: injected };
    const nextMessage = { ...message, params: nextParams };
    return `${JSON.stringify(nextMessage)}\n`;
  }

  async function enforceToolCallPermissions(
    message: { id?: string | number | null; params?: unknown },
    toolName: string
  ): Promise<boolean> {
    const args = extractToolArguments(message);
    const gate = await evaluatePermissionGate({ toolName, arguments: args }, budget);
    if (gate.verdict === 'allow') return false;
    const violation = gate.violation;
    const reason = violation?.type ?? 'permission_denied';
    const value = violation?.value ?? 'unknown';
    void logger.append({ method: 'tools/call', verdict: 'block', tool_name: toolName, reason });
    const errorMessage = `tank: permission denied (${reason}: ${value})`;
    agentStdout.write(framingError(-32001, errorMessage, message.id ?? null));
    return true;
  }

  function handleOutbound(line: string): void {
    const parsed = parseJsonRpcMessage(line);
    if (!parsed.ok) {
      void logger.append({ method: 'invalid', verdict: 'pass' });
      agentStdout.write(`${line}\n`);
      return;
    }
    const id = parsed.message.id;
    const pending = id !== undefined && id !== null ? pendingRequests.get(id) : undefined;
    if (id !== undefined && id !== null) pendingRequests.delete(id);
    const method = pending?.method ?? parsed.message.method ?? 'response';
    if (method === 'tools/list') {
      emitScannedToolsList(parsed.message, line);
      return;
    }
    if (method === 'tools/call' && pending?.toolName !== undefined) {
      const blocked = emitScannedToolCall(parsed.message, line, pending.toolName);
      if (blocked) return;
    }
    if (method === 'resources/list') {
      emitScannedResourcesList(parsed.message);
      return;
    }
    if (method === 'resources/read') {
      if (emitScannedResourceRead(parsed.message, line)) return;
    }
    if (method === 'prompts/list') {
      emitScannedPromptsList(parsed.message);
      return;
    }
    if (method === 'prompts/get') {
      if (emitScannedPromptGet(parsed.message, line)) return;
    }
    void logger.append({ method, verdict: 'pass' });
    agentStdout.write(`${line}\n`);
  }

  function emitScannedResourcesList(message: JsonRpcMessageRef): void {
    const result = interceptResourcesListResponse(message);
    for (const b of result.blocked) {
      void logger.append({ method: 'resources/list', verdict: 'block', reason: b.reason });
    }
    agentStdout.write(`${JSON.stringify(result.outbound)}\n`);
  }

  function emitScannedResourceRead(message: JsonRpcMessageRef, rawFallback: string): boolean {
    const result = interceptResourceReadResponse(message);
    if (!result.blocked) {
      void logger.append({ method: 'resources/read', verdict: 'pass' });
      agentStdout.write(`${rawFallback}\n`);
      return true;
    }
    const reason = result.reason ?? 'resource_poisoning_detected';
    void logger.append({ method: 'resources/read', verdict: 'block', reason });
    agentStdout.write(framingError(-32004, `tank: ${reason}`, message.id ?? null));
    return true;
  }

  function emitScannedPromptsList(message: JsonRpcMessageRef): void {
    const result = interceptPromptsListResponse(message);
    for (const b of result.blocked) {
      void logger.append({ method: 'prompts/list', verdict: 'block', reason: b.reason });
    }
    agentStdout.write(`${JSON.stringify(result.outbound)}\n`);
  }

  function emitScannedPromptGet(message: JsonRpcMessageRef, rawFallback: string): boolean {
    const result = interceptPromptGetResponse(message);
    if (!result.blocked) {
      void logger.append({ method: 'prompts/get', verdict: 'pass' });
      agentStdout.write(`${rawFallback}\n`);
      return true;
    }
    const reason = result.reason ?? 'prompt_poisoning_detected';
    void logger.append({ method: 'prompts/get', verdict: 'block', reason });
    agentStdout.write(framingError(-32005, `tank: ${reason}`, message.id ?? null));
    return true;
  }

  function emitScannedToolCall(message: JsonRpcMessageRef, rawFallback: string, toolName: string): boolean {
    const result = interceptToolCallResponse(toolName, message, { session: canarySession });
    if (!result.blocked) {
      agentStdout.write(`${rawFallback}\n`);
      return true;
    }
    const leak = result.leaks[0];
    const sourceTool = leak?.source ?? 'unknown';
    void logger.append({
      method: 'tools/call',
      verdict: 'block',
      tool_name: toolName,
      reason: 'canary_leak_detected',
      source_tool: sourceTool
    });
    agentStdout.write(framingError(-32003, `tank: canary_leak_detected (source: ${sourceTool})`, message.id ?? null));
    return true;
  }

  function emitScannedToolsList(message: JsonRpcMessageRef, rawFallback: string): void {
    let result: ReturnType<typeof interceptToolsListResponse>;
    try {
      result = interceptToolsListResponse('tools/list', message, {
        packageHash,
        pinsDir,
        blockOnMatch,
        onAudit: (entry) => {
          void logger.append({
            method: entry.method,
            verdict: entry.verdict,
            ...(entry.toolName !== undefined ? { tool_name: entry.toolName } : {}),
            ...(entry.reason !== undefined ? { reason: entry.reason } : {})
          });
        }
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      void logger.append({ method: 'tools/list', verdict: 'block', reason: 'pin_read_failed' });
      const errorFrame = framingError(-32002, `tank: pin read failed (${reason})`, message.id ?? null);
      agentStdout.write(errorFrame);
      return;
    }
    if (result.blockedTools.length === 0) {
      void logger.append({ method: 'tools/list', verdict: 'pass' });
      agentStdout.write(`${rawFallback}\n`);
      return;
    }
    agentStdout.write(`${JSON.stringify(result.outbound)}\n`);
  }

  return {
    exitCode,
    kill(signal = 'SIGTERM') {
      child.kill(signal);
    }
  };
}

type JsonRpcMessageRef = Parameters<typeof interceptToolsListResponse>[1];

function extractToolName(msg: { method?: string; params?: unknown }): string | undefined {
  if (msg.method !== 'tools/call') return undefined;
  if (typeof msg.params !== 'object' || msg.params === null) return undefined;
  const name = (msg.params as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

function extractToolArguments(msg: { params?: unknown }): unknown {
  if (typeof msg.params !== 'object' || msg.params === null) return null;
  return (msg.params as { arguments?: unknown }).arguments ?? null;
}

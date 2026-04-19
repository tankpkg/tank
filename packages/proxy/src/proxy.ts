import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { isPathAllowedWithRealpath } from '@internals/helpers';
import { type AuditLogger, createAuditLogger } from './audit/logger.ts';
import { computePinIdentity } from './scanner/pin-identity.ts';
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
}

export interface ProxyHandle {
  exitCode: Promise<number>;
  kill(signal?: NodeJS.Signals): void;
}

const DEFAULT_AUDIT_PATH = join(homedir(), '.tank', 'proxy', 'audit.jsonl');
const DEFAULT_PINS_DIR = join(homedir(), '.tank', 'proxy', 'pins');

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

  const resolvedCommand = resolveCommandPath(options.command);
  const allowlist = options.allowlist ?? defaultAllowlist();
  const allowed = await isPathAllowedWithRealpath(resolvedCommand, allowlist);
  if (!allowed) {
    throw new Error(`proxy: command path not allowed: ${options.command}`);
  }

  const child: StdioChildHandle = spawnChild(resolvedCommand, options.args);
  const pendingRequests = new Map<string | number, string>();

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
    const parsed = parseJsonRpcMessage(line);
    if (!parsed.ok) {
      agentStdout.write(framingError(parsed.code, parsed.message, parsed.id));
      void logger.append({ method: 'invalid', verdict: 'block', reason: parsed.message });
      return;
    }
    const method = parsed.message.method ?? 'unknown';
    const toolName = extractToolName(parsed.message);
    const entry: { method: string; verdict: 'pass' | 'block'; tool_name?: string } = {
      method,
      verdict: 'pass'
    };
    if (toolName !== undefined) entry.tool_name = toolName;
    void logger.append(entry);
    if (parsed.message.id !== undefined && parsed.message.id !== null) {
      pendingRequests.set(parsed.message.id, method);
    }
    child.write(parsed.raw);
  }

  function handleOutbound(line: string): void {
    const parsed = parseJsonRpcMessage(line);
    if (!parsed.ok) {
      void logger.append({ method: 'invalid', verdict: 'pass' });
      agentStdout.write(`${line}\n`);
      return;
    }
    const id = parsed.message.id;
    const requestMethod = id !== undefined && id !== null ? pendingRequests.get(id) : undefined;
    if (id !== undefined && id !== null) pendingRequests.delete(id);
    const method = requestMethod ?? parsed.message.method ?? 'response';
    if (method === 'tools/list') {
      emitScannedToolsList(parsed.message, line);
      return;
    }
    void logger.append({ method, verdict: 'pass' });
    agentStdout.write(`${line}\n`);
  }

  function emitScannedToolsList(message: JsonRpcMessageRef, rawFallback: string): void {
    const result = interceptToolsListResponse('tools/list', message, {
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

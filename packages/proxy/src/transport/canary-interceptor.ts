import type { CanaryLeak, CanarySession } from '../scanner/canary-session.ts';
import type { JsonRpcMessage } from './message-router.ts';

export interface CanaryInterceptorContext {
  session: CanarySession;
}

export interface CanaryInterceptResult {
  outbound: JsonRpcMessage;
  leaks: CanaryLeak[];
  blocked: boolean;
}

function extractTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const item of content) {
    if (item === null || typeof item !== 'object') continue;
    const text = (item as { text?: unknown }).text;
    if (typeof text === 'string') parts.push(text);
  }
  return parts.join('\n');
}

function extractResponseText(message: JsonRpcMessage): string {
  if (message.result === undefined || message.result === null) return '';
  if (typeof message.result !== 'object') return '';
  const content = (message.result as { content?: unknown }).content;
  return extractTextFromContent(content);
}

export function interceptToolCallResponse(
  toolName: string,
  message: JsonRpcMessage,
  ctx: CanaryInterceptorContext
): CanaryInterceptResult {
  const text = extractResponseText(message);
  if (text.length === 0) return { outbound: message, leaks: [], blocked: false };
  const leaks = ctx.session.scanResponse(toolName, text);
  return { outbound: message, leaks, blocked: leaks.length > 0 };
}

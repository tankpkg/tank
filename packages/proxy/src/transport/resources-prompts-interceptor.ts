import { scanForCredentialLeak } from '../scanner/credential-leak.ts';
import { scanForPromptInjection } from '../scanner/prompt-injection.ts';
import type { JsonRpcMessage } from './message-router.ts';

export interface StrippedItem {
  uri?: string;
  name?: string;
  reason: string;
}

export interface ListInterceptResult {
  outbound: JsonRpcMessage;
  blocked: StrippedItem[];
}

export interface ReadInterceptResult {
  outbound: JsonRpcMessage;
  blocked: boolean;
  reason?: 'prompt_injection_in_resource' | 'credential_leak_in_resource';
}

export interface PromptGetInterceptResult {
  outbound: JsonRpcMessage;
  blocked: boolean;
  reason?: 'hidden_instruction_in_prompt' | 'credential_leak_in_prompt';
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function arrayOrNull(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function scanDescription(description: unknown): boolean {
  if (typeof description !== 'string' || description.length === 0) return false;
  return scanForPromptInjection(description).matched;
}

export function interceptResourcesListResponse(message: JsonRpcMessage): ListInterceptResult {
  const result = asObject(message.result);
  if (result === null) return { outbound: message, blocked: [] };
  const resources = arrayOrNull(result.resources);
  if (resources === null) return { outbound: message, blocked: [] };

  const blocked: StrippedItem[] = [];
  const kept: unknown[] = [];
  for (const entry of resources) {
    const obj = asObject(entry);
    if (obj === null) {
      kept.push(entry);
      continue;
    }
    if (scanDescription(obj.description)) {
      blocked.push({
        uri: typeof obj.uri === 'string' ? obj.uri : undefined,
        reason: 'hidden_instruction_in_resource_description'
      });
      continue;
    }
    kept.push(entry);
  }

  if (blocked.length === 0) return { outbound: message, blocked: [] };
  const outbound: JsonRpcMessage = { ...message, result: { ...result, resources: kept } };
  return { outbound, blocked };
}

export function interceptPromptsListResponse(message: JsonRpcMessage): ListInterceptResult {
  const result = asObject(message.result);
  if (result === null) return { outbound: message, blocked: [] };
  const prompts = arrayOrNull(result.prompts);
  if (prompts === null) return { outbound: message, blocked: [] };

  const blocked: StrippedItem[] = [];
  const kept: unknown[] = [];
  for (const entry of prompts) {
    const obj = asObject(entry);
    if (obj === null) {
      kept.push(entry);
      continue;
    }
    if (scanDescription(obj.description)) {
      blocked.push({
        name: typeof obj.name === 'string' ? obj.name : undefined,
        reason: 'hidden_instruction_in_prompt_description'
      });
      continue;
    }
    kept.push(entry);
  }

  if (blocked.length === 0) return { outbound: message, blocked: [] };
  const outbound: JsonRpcMessage = { ...message, result: { ...result, prompts: kept } };
  return { outbound, blocked };
}

function extractResourceReadText(message: JsonRpcMessage): string {
  const result = asObject(message.result);
  if (result === null) return '';
  const contents = arrayOrNull(result.contents);
  if (contents === null) return '';
  const parts: string[] = [];
  for (const item of contents) {
    const obj = asObject(item);
    if (obj === null) continue;
    if (typeof obj.text === 'string') parts.push(obj.text);
  }
  return parts.join('\n');
}

export function interceptResourceReadResponse(message: JsonRpcMessage): ReadInterceptResult {
  const text = extractResourceReadText(message);
  if (text.length === 0) return { outbound: message, blocked: false };
  if (scanForPromptInjection(text).matched) {
    return { outbound: message, blocked: true, reason: 'prompt_injection_in_resource' };
  }
  if (scanForCredentialLeak(text).matched) {
    return { outbound: message, blocked: true, reason: 'credential_leak_in_resource' };
  }
  return { outbound: message, blocked: false };
}

function extractPromptMessagesText(message: JsonRpcMessage): string {
  const result = asObject(message.result);
  if (result === null) return '';
  const messages = arrayOrNull(result.messages);
  if (messages === null) return '';
  const parts: string[] = [];
  for (const item of messages) {
    const obj = asObject(item);
    if (obj === null) continue;
    const content = asObject(obj.content);
    if (content === null) continue;
    if (typeof content.text === 'string') parts.push(content.text);
  }
  return parts.join('\n');
}

export function interceptPromptGetResponse(message: JsonRpcMessage): PromptGetInterceptResult {
  const text = extractPromptMessagesText(message);
  if (text.length === 0) return { outbound: message, blocked: false };
  if (scanForPromptInjection(text).matched) {
    return { outbound: message, blocked: true, reason: 'hidden_instruction_in_prompt' };
  }
  if (scanForCredentialLeak(text).matched) {
    return { outbound: message, blocked: true, reason: 'credential_leak_in_prompt' };
  }
  return { outbound: message, blocked: false };
}

import { describe, expect, it } from 'vitest';
import { framingError, parseJsonRpcMessage } from '../transport/message-router.ts';

describe('parseJsonRpcMessage — MCP spec 2025-06-18 (newline-delimited JSON)', () => {
  it('parses valid JSON-RPC 2.0 request on a single line', () => {
    const result = parseJsonRpcMessage('{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.method).toBe('tools/list');
      expect(result.message.id).toBe(1);
    }
  });

  it('rejects malformed JSON with JSON-RPC parse error (-32700)', () => {
    const result = parseJsonRpcMessage('{"jsonrpc":"2.0",id:}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(-32700);
      expect(result.id).toBeNull();
    }
  });

  it('rejects messages missing jsonrpc:"2.0" with invalid request (-32600)', () => {
    const result = parseJsonRpcMessage('{"id":1,"method":"tools/list"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(-32600);
      expect(result.id).toBe(1);
    }
  });

  it('rejects empty lines with parse error', () => {
    const result = parseJsonRpcMessage('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(-32700);
  });

  it('preserves id for error mapping when id is a string', () => {
    const result = parseJsonRpcMessage('{"id":"req-42"}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.id).toBe('req-42');
  });

  it('parses JSON-RPC response with result', () => {
    const result = parseJsonRpcMessage('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message.result).toEqual({ tools: [] });
  });

  it('parses notification (no id)', () => {
    const result = parseJsonRpcMessage('{"jsonrpc":"2.0","method":"notifications/initialized"}');
    expect(result.ok).toBe(true);
  });
});

describe('framingError — NDJSON single-line serialization', () => {
  it('emits exactly one newline at the end', () => {
    const line = framingError(-32700, 'Parse error', null);
    const newlines = (line.match(/\n/g) ?? []).length;
    expect(newlines).toBe(1);
    expect(line.endsWith('\n')).toBe(true);
  });

  it('does not embed newlines in the JSON body', () => {
    const line = framingError(-32700, 'Parse\nerror with\nnewlines', null);
    const body = line.slice(0, -1);
    expect(body.includes('\n')).toBe(false);
  });

  it('produces valid JSON-RPC 2.0 error response shape', () => {
    const line = framingError(-32600, 'Invalid Request', 42);
    const parsed = JSON.parse(line.trim());
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.id).toBe(42);
    expect(parsed.error.code).toBe(-32600);
    expect(parsed.error.message).toBe('Invalid Request');
  });
});

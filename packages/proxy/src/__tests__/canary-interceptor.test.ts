import { beforeEach, describe, expect, it } from 'vitest';
import { CanarySession } from '~/scanner/canary-session.js';
import { interceptToolCallResponse } from '~/transport/canary-interceptor.js';

let session: CanarySession;

beforeEach(() => {
  session = new CanarySession();
});

function buildResponse(content: Array<{ type: string; text?: string }>) {
  return {
    jsonrpc: '2.0' as const,
    id: 1,
    result: { content }
  };
}

describe('interceptToolCallResponse (C21) — response-side canary scan', () => {
  it('returns no leaks and leaves response untouched when no canary present', () => {
    session.mint('tool_a');
    const response = buildResponse([{ type: 'text', text: 'normal output' }]);
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.leaks).toEqual([]);
    expect(result.outbound).toBe(response);
  });

  it('returns no leaks on self-echo (same tool echoing its own canary)', () => {
    const canary = session.mint('tool_a');
    const response = buildResponse([{ type: 'text', text: `echoed ${canary}` }]);
    const result = interceptToolCallResponse('tool_a', response, { session });
    expect(result.leaks).toEqual([]);
  });

  it('reports a leak when another tool echoes the canary', () => {
    const canary = session.mint('tool_a');
    const response = buildResponse([{ type: 'text', text: `leaked ${canary}` }]);
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0]).toEqual({ canary, source: 'tool_a' });
  });

  it('blocks the response when a leak is detected', () => {
    const canary = session.mint('tool_a');
    const response = buildResponse([{ type: 'text', text: `leaked ${canary}` }]);
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.blocked).toBe(true);
  });

  it('does NOT block when no leak is detected', () => {
    session.mint('tool_a');
    const response = buildResponse([{ type: 'text', text: 'clean output' }]);
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.blocked).toBe(false);
  });

  it('scans across multiple content items (MCP allows array of parts)', () => {
    const canary = session.mint('tool_a');
    const response = buildResponse([
      { type: 'text', text: 'part 1' },
      { type: 'text', text: `part 2 ${canary}` },
      { type: 'text', text: 'part 3' }
    ]);
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0]?.canary).toBe(canary);
  });

  it('ignores non-text content parts (e.g. image)', () => {
    session.mint('tool_a');
    const response = buildResponse([{ type: 'image', text: undefined }]);
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.leaks).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it('tolerates missing result object — no leaks, no block', () => {
    session.mint('tool_a');
    const response = { jsonrpc: '2.0' as const, id: 1 };
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.leaks).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it('tolerates malformed result.content (not array) — no leaks, no block', () => {
    session.mint('tool_a');
    const response = { jsonrpc: '2.0' as const, id: 1, result: { content: 'not an array' } };
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.leaks).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it('detects canary buried in a long text payload', () => {
    const canary = session.mint('tool_a');
    const longText = `${'x'.repeat(5000)}${canary}${'y'.repeat(5000)}`;
    const response = buildResponse([{ type: 'text', text: longText }]);
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.blocked).toBe(true);
  });

  it('detects multiple distinct canaries from different source tools in one response', () => {
    const canaryA = session.mint('tool_a');
    const canaryC = session.mint('tool_c');
    const response = buildResponse([{ type: 'text', text: `${canaryA} and ${canaryC}` }]);
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.leaks).toHaveLength(2);
    expect(result.leaks.map((l) => l.source).sort()).toEqual(['tool_a', 'tool_c']);
  });

  it('handles content item where text is not a string', () => {
    session.mint('tool_a');
    const response = buildResponse([{ type: 'text', text: undefined }]);
    const result = interceptToolCallResponse('tool_b', response, { session });
    expect(result.leaks).toEqual([]);
  });
});

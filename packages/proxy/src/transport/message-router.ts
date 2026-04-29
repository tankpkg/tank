// MCP stdio transport framing per spec 2025-06-18: newline-delimited JSON,
// messages MUST NOT contain embedded newlines. Security-critical — violations
// break downstream parsers for all subsequent messages on the stream.

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type FramingResult =
  | { ok: true; message: JsonRpcMessage; raw: string }
  | { ok: false; code: number; message: string; id: string | number | null };

const JSONRPC_PARSE_ERROR = -32700;
const JSONRPC_INVALID_REQUEST = -32600;

export function parseJsonRpcMessage(line: string): FramingResult {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: JSONRPC_PARSE_ERROR, message: 'Empty line', id: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, code: JSONRPC_PARSE_ERROR, message: 'Parse error', id: null };
  }

  if (!isRecord(parsed) || parsed.jsonrpc !== '2.0') {
    const id = isRecord(parsed) && (typeof parsed.id === 'string' || typeof parsed.id === 'number') ? parsed.id : null;
    return { ok: false, code: JSONRPC_INVALID_REQUEST, message: 'Invalid JSON-RPC 2.0 message', id };
  }

  return { ok: true, message: parsed as unknown as JsonRpcMessage, raw: trimmed };
}

export function framingError(code: number, message: string, id: string | number | null): string {
  return `${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

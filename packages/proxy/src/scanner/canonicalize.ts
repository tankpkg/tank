import { createHash } from 'node:crypto';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function canonicalize(value: unknown): JsonValue {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') return canonicalizeObject(value as Record<string, unknown>);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

function canonicalizeObject(source: Record<string, unknown>): { [key: string]: JsonValue } {
  const keys = Object.keys(source).sort();
  const sorted: { [key: string]: JsonValue } = {};
  for (const key of keys) {
    sorted[key] = canonicalize(source[key]);
  }
  return sorted;
}

export function canonicalizeSchema(schema: unknown): string {
  return JSON.stringify(canonicalize(schema));
}

export function hashSchema(schema: unknown): string {
  return createHash('sha256').update(canonicalizeSchema(schema)).digest('hex');
}

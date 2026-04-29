import { describe, expect, it } from 'vitest';
import { canonicalizeSchema, hashSchema } from '~/scanner/canonicalize.js';

describe('canonicalizeSchema (C12)', () => {
  it('sorts top-level keys alphabetically', () => {
    const a = canonicalizeSchema({ name: 'x', description: 'y', inputSchema: {} });
    const b = canonicalizeSchema({ inputSchema: {}, description: 'y', name: 'x' });
    expect(a).toBe(b);
  });

  it('removes whitespace inside serialized output', () => {
    expect(canonicalizeSchema({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('sorts nested-object keys recursively', () => {
    const a = canonicalizeSchema({ outer: { alpha: 1, beta: 2 } });
    const b = canonicalizeSchema({ outer: { beta: 2, alpha: 1 } });
    expect(a).toBe(b);
  });

  it('preserves array element order (arrays are not sorted)', () => {
    expect(canonicalizeSchema({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
  });

  it('canonicalizes objects inside arrays', () => {
    const a = canonicalizeSchema({ items: [{ x: 1, y: 2 }] });
    const b = canonicalizeSchema({ items: [{ y: 2, x: 1 }] });
    expect(a).toBe(b);
  });

  it('handles nested-object key ordering at arbitrary depth', () => {
    const a = canonicalizeSchema({ a: { b: { c: { d: 1, e: 2 } } } });
    const b = canonicalizeSchema({ a: { b: { c: { e: 2, d: 1 } } } });
    expect(a).toBe(b);
  });

  it('encodes null, booleans, and numbers unchanged', () => {
    expect(canonicalizeSchema({ a: null, b: true, c: 42 })).toBe('{"a":null,"b":true,"c":42}');
  });

  it('escapes strings consistently', () => {
    expect(canonicalizeSchema({ msg: 'hello "world"' })).toBe('{"msg":"hello \\"world\\""}');
  });
});

describe('hashSchema (C12)', () => {
  it('returns a SHA-256 hex string (64 chars)', () => {
    const hash = hashSchema({ name: 'read_file', description: 'Read a file' });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces identical hashes for semantically-equal schemas', () => {
    const a = hashSchema({ name: 'x', description: 'y' });
    const b = hashSchema({ description: 'y', name: 'x' });
    expect(a).toBe(b);
  });

  it('produces different hashes when any field changes', () => {
    const a = hashSchema({ name: 'x', description: 'Read a file' });
    const b = hashSchema({ name: 'x', description: 'Read a file.' });
    expect(a).not.toBe(b);
  });

  it('is stable across whitespace differences in the source representation', () => {
    const a = hashSchema({ schema: { path: 'string' } });
    const b = hashSchema({ schema: { path: 'string' } });
    expect(a).toBe(b);
  });
});

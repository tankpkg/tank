import { describe, expect, it } from 'vitest';
import { injectCanary } from '~/scanner/canary-inject.js';

const CANARY = '0123456789abcdef';

describe('injectCanary (C22) — _meta.tank_canary placement', () => {
  it('adds _meta.tank_canary to object arguments without _meta', () => {
    const args = { input: 'hello' };
    const result = injectCanary(args, CANARY);
    expect(result).toEqual({ input: 'hello', _meta: { tank_canary: CANARY } });
  });

  it('merges tank_canary into existing _meta object, preserving other keys', () => {
    const args = { input: 'hi', _meta: { progress_token: 'p1' } };
    const result = injectCanary(args, CANARY);
    expect(result).toEqual({
      input: 'hi',
      _meta: { progress_token: 'p1', tank_canary: CANARY }
    });
  });

  it('overwrites an existing _meta.tank_canary (proxy is authoritative)', () => {
    const args = { input: 'hi', _meta: { tank_canary: 'forged_value' } };
    const result = injectCanary(args, CANARY);
    expect(result).toEqual({ input: 'hi', _meta: { tank_canary: CANARY } });
  });

  it('does not modify the original arguments object (returns new reference)', () => {
    const args = { input: 'hello' };
    const result = injectCanary(args, CANARY);
    expect(result).not.toBe(args);
    expect(args).toEqual({ input: 'hello' });
  });

  it('does not clone _meta contents shared with the input (shallow merge only)', () => {
    const original = { input: 'hi', _meta: { progress_token: 'p1' } };
    const result = injectCanary(original, CANARY) as { _meta: { progress_token: string } };
    expect(result._meta.progress_token).toBe('p1');
    expect(result._meta).not.toBe(original._meta);
  });

  it('does not inject if args is null — returns an object with only _meta', () => {
    const result = injectCanary(null, CANARY);
    expect(result).toEqual({ _meta: { tank_canary: CANARY } });
  });

  it('does not inject if args is undefined — returns an object with only _meta', () => {
    const result = injectCanary(undefined, CANARY);
    expect(result).toEqual({ _meta: { tank_canary: CANARY } });
  });

  it('returns {_meta:{tank_canary}} when args is a non-object primitive (string)', () => {
    const result = injectCanary('raw-string', CANARY);
    expect(result).toEqual({ _meta: { tank_canary: CANARY } });
  });

  it('returns {_meta:{tank_canary}} when args is a non-object primitive (number)', () => {
    const result = injectCanary(42, CANARY);
    expect(result).toEqual({ _meta: { tank_canary: CANARY } });
  });

  it('returns {_meta:{tank_canary}} when args is an array (not a valid MCP args shape)', () => {
    const result = injectCanary([1, 2], CANARY);
    expect(result).toEqual({ _meta: { tank_canary: CANARY } });
  });

  it('replaces a non-object _meta value with a new _meta object', () => {
    const args = { input: 'hi', _meta: 'invalid' };
    const result = injectCanary(args, CANARY);
    expect(result).toEqual({ input: 'hi', _meta: { tank_canary: CANARY } });
  });

  it('does not mutate a nested _meta reference when preserving keys', () => {
    const originalMeta = { progress_token: 'p1' };
    const args = { input: 'hi', _meta: originalMeta };
    injectCanary(args, CANARY);
    expect(originalMeta).toEqual({ progress_token: 'p1' });
  });

  it('functional arguments (non-_meta) are preserved byte-for-byte', () => {
    const args = {
      path: './README.md',
      recursive: true,
      opts: { max: 10 }
    };
    const result = injectCanary(args, CANARY) as Record<string, unknown>;
    expect(result.path).toBe('./README.md');
    expect(result.recursive).toBe(true);
    expect(result.opts).toEqual({ max: 10 });
  });
});

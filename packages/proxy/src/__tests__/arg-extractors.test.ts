import { describe, expect, it } from 'vitest';
import { MAX_TRAVERSAL_DEPTH, extractPathReferences, extractUrlReferences } from '~/enforcer/arg-extractors.js';

describe('extractUrlReferences (C27, C31)', () => {
  it('finds an http URL at top level', () => {
    expect(extractUrlReferences({ url: 'http://example.com/x' })).toEqual([
      { url: 'http://example.com/x', hostname: 'example.com' }
    ]);
  });

  it('finds an https URL nested inside an object', () => {
    const args = { config: { endpoint: 'https://api.stripe.com/v1' } };
    expect(extractUrlReferences(args)).toEqual([{ url: 'https://api.stripe.com/v1', hostname: 'api.stripe.com' }]);
  });

  it('finds URLs inside arrays', () => {
    const args = { urls: ['https://a.com', 'https://b.com'] };
    expect(extractUrlReferences(args).map((r) => r.hostname)).toEqual(['a.com', 'b.com']);
  });

  it('finds URLs deeply nested to depth 15', () => {
    let nested: unknown = 'https://deep.example.com';
    for (let i = 0; i < 15; i++) nested = { next: nested };
    const result = extractUrlReferences(nested);
    expect(result).toHaveLength(1);
    expect(result[0]?.hostname).toBe('deep.example.com');
  });

  it('stops recursion at MAX_TRAVERSAL_DEPTH (16)', () => {
    expect(MAX_TRAVERSAL_DEPTH).toBe(16);
    let nested: unknown = 'https://too-deep.example.com';
    for (let i = 0; i < 20; i++) nested = { next: nested };
    const result = extractUrlReferences(nested);
    expect(result).toEqual([]);
  });

  it('ignores strings that do not start with http:// or https://', () => {
    expect(extractUrlReferences({ value: 'api.example.com' })).toEqual([]);
    expect(extractUrlReferences({ value: 'ws://example.com' })).toEqual([]);
    expect(extractUrlReferences({ value: 'ftp://example.com' })).toEqual([]);
  });

  it('ignores malformed URLs (no throw)', () => {
    expect(extractUrlReferences({ url: 'http://' })).toEqual([]);
    expect(extractUrlReferences({ url: 'https://' })).toEqual([]);
    expect(() => extractUrlReferences({ url: 'http://\uD83D' })).not.toThrow();
  });

  it('handles null, undefined, numbers, booleans without throwing', () => {
    expect(extractUrlReferences(null)).toEqual([]);
    expect(extractUrlReferences(undefined)).toEqual([]);
    expect(extractUrlReferences(42)).toEqual([]);
    expect(extractUrlReferences(true)).toEqual([]);
  });

  it('finds multiple URLs across mixed siblings', () => {
    const args = {
      primary: 'https://api.a.com',
      fallback: 'https://api.b.com',
      meta: { health: 'https://health.c.com' }
    };
    const hostnames = extractUrlReferences(args)
      .map((r) => r.hostname)
      .sort();
    expect(hostnames).toEqual(['api.a.com', 'api.b.com', 'health.c.com']);
  });

  it('is circular-reference safe (does not infinite loop)', () => {
    const root: Record<string, unknown> = { url: 'https://ok.com' };
    root.self = root;
    expect(() => extractUrlReferences(root)).not.toThrow();
  });
});

describe('extractPathReferences (C28, C31)', () => {
  it('finds path in a "path" field at top level', () => {
    expect(extractPathReferences({ path: '/etc/passwd' })).toEqual(['/etc/passwd']);
  });

  it('finds paths in any of: path, file, filename, directory, dir', () => {
    const args = { path: '/a', file: '/b', filename: '/c', directory: '/d', dir: '/e' };
    expect(extractPathReferences(args).sort()).toEqual(['/a', '/b', '/c', '/d', '/e']);
  });

  it('finds paths nested inside objects', () => {
    expect(extractPathReferences({ options: { path: './src/main.ts' } })).toEqual(['./src/main.ts']);
  });

  it('finds paths inside arrays of objects', () => {
    const args = { files: [{ path: '/a' }, { path: '/b' }] };
    expect(extractPathReferences(args).sort()).toEqual(['/a', '/b']);
  });

  it('ignores non-string values in path fields (no string coercion)', () => {
    expect(extractPathReferences({ path: 42 })).toEqual([]);
    expect(extractPathReferences({ path: null })).toEqual([]);
    expect(extractPathReferences({ path: true })).toEqual([]);
  });

  it('still walks into non-string "path" field values looking for nested path fields', () => {
    expect(extractPathReferences({ path: { file: '/x' } })).toEqual(['/x']);
  });

  it('ignores field names that are not in the allowlist', () => {
    expect(extractPathReferences({ location: '/etc/passwd', target: '/tmp' })).toEqual([]);
  });

  it('stops recursion at MAX_TRAVERSAL_DEPTH (16)', () => {
    let nested: unknown = { path: '/too-deep' };
    for (let i = 0; i < 20; i++) nested = { next: nested };
    expect(extractPathReferences(nested)).toEqual([]);
  });

  it('handles null / undefined / primitives without throwing', () => {
    expect(extractPathReferences(null)).toEqual([]);
    expect(extractPathReferences(undefined)).toEqual([]);
    expect(extractPathReferences(42)).toEqual([]);
  });

  it('is circular-reference safe (does not infinite loop)', () => {
    const root: Record<string, unknown> = { path: '/a' };
    root.self = root;
    expect(() => extractPathReferences(root)).not.toThrow();
  });

  it('field names are case-sensitive (Path ≠ path)', () => {
    expect(extractPathReferences({ Path: '/a', FILE: '/b' })).toEqual([]);
  });
});

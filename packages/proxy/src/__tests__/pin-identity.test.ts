import { describe, expect, it } from 'vitest';
import { computePinIdentity } from '~/scanner/pin-identity.js';

describe('computePinIdentity (C14a, D19)', () => {
  it('returns SHA-256 hex of canonicalized argv as a 64-char hex string', () => {
    const id = computePinIdentity(['npx', '@org/mcp-server']);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic: same argv yields same identity across calls', () => {
    const a = computePinIdentity(['npx', '@org/mcp-server']);
    const b = computePinIdentity(['npx', '@org/mcp-server']);
    expect(a).toBe(b);
  });

  it('trims per-element whitespace before hashing', () => {
    const trimmed = computePinIdentity(['npx', '@org/mcp-server']);
    const padded = computePinIdentity([' npx ', '\t@org/mcp-server\n']);
    expect(padded).toBe(trimmed);
  });

  it('produces distinct identities for different argv sequences', () => {
    const a = computePinIdentity(['npx', '@org/mcp-server']);
    const b = computePinIdentity(['npx', '@org/other-server']);
    expect(a).not.toBe(b);
  });

  it('order-sensitive: swapping argv positions yields different identity', () => {
    const a = computePinIdentity(['a', 'b']);
    const b = computePinIdentity(['b', 'a']);
    expect(a).not.toBe(b);
  });

  it('handles the remote form ["--remote", <url>] per D19', () => {
    const remote = computePinIdentity(['--remote', 'https://example.com/sse']);
    const local = computePinIdentity(['npx', '@org/example']);
    expect(remote).toMatch(/^[0-9a-f]{64}$/);
    expect(remote).not.toBe(local);
  });

  it('rejects empty argv arrays', () => {
    expect(() => computePinIdentity([])).toThrow();
  });
});

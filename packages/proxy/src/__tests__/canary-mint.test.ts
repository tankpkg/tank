import { describe, expect, it } from 'vitest';
import { mintCanary } from '~/scanner/canary.js';

describe('mintCanary (C20) — canary format', () => {
  it('returns a 16-character hex string', () => {
    const canary = mintCanary();
    expect(canary).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns a different canary on each call', () => {
    const canaries = new Set<string>();
    for (let i = 0; i < 1000; i++) canaries.add(mintCanary());
    expect(canaries.size).toBe(1000);
  });

  it('does not include the "sha256:" prefix or any non-hex characters', () => {
    for (let i = 0; i < 50; i++) {
      const canary = mintCanary();
      expect(canary).not.toContain(':');
      expect(canary).not.toContain('-');
      expect(canary).not.toContain('_');
    }
  });

  it('has consistent length exactly 16 (8 random bytes)', () => {
    for (let i = 0; i < 100; i++) {
      expect(mintCanary()).toHaveLength(16);
    }
  });
});

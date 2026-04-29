import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanarySession } from '~/scanner/canary-session.js';

let session: CanarySession;

beforeEach(() => {
  session = new CanarySession();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CanarySession (C19, C20, C21) — session registry', () => {
  it('mint() returns a 16-hex-char canary and registers it for a tool', () => {
    const canary = session.mint('tool_a');
    expect(canary).toMatch(/^[0-9a-f]{16}$/);
    expect(session.sourceOf(canary)).toBe('tool_a');
  });

  it('mint() returns a different canary on every call', () => {
    const a = session.mint('tool_a');
    const b = session.mint('tool_a');
    expect(a).not.toBe(b);
  });

  it('sourceOf() returns undefined for an unknown canary', () => {
    expect(session.sourceOf('0000000000000000')).toBeUndefined();
  });

  it('scanResponse() returns [] when text contains no active canary', () => {
    session.mint('tool_a');
    const leaks = session.scanResponse('tool_b', 'some unrelated output');
    expect(leaks).toEqual([]);
  });

  it('scanResponse() returns [] for self-echo (same tool that minted it)', () => {
    const canary = session.mint('tool_a');
    const leaks = session.scanResponse('tool_a', `echoed: ${canary}`);
    expect(leaks).toEqual([]);
  });

  it('scanResponse() reports a leak when another tool echoes the canary', () => {
    const canary = session.mint('tool_a');
    const leaks = session.scanResponse('tool_b', `leaked value: ${canary}`);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toEqual({ canary, source: 'tool_a' });
  });

  it('scanResponse() can detect multiple distinct canaries in one response', () => {
    const c1 = session.mint('tool_a');
    const c2 = session.mint('tool_c');
    const leaks = session.scanResponse('tool_b', `${c1} and ${c2}`);
    expect(leaks).toHaveLength(2);
    expect(leaks.map((l) => l.source).sort()).toEqual(['tool_a', 'tool_c']);
  });

  it('scanResponse() does not match canaries from previous sessions', () => {
    const stale = '0123456789abcdef';
    const leaks = session.scanResponse('tool_b', `stale: ${stale}`);
    expect(leaks).toEqual([]);
  });

  it('scanResponse() handles empty text', () => {
    session.mint('tool_a');
    expect(session.scanResponse('tool_b', '')).toEqual([]);
  });

  it('size() reports the number of live canaries', () => {
    expect(session.size()).toBe(0);
    session.mint('tool_a');
    session.mint('tool_b');
    expect(session.size()).toBe(2);
  });

  it('evicts oldest canary when cache cap is exceeded (LRU bound)', () => {
    const cappedSession = new CanarySession({ maxEntries: 3 });
    const c1 = cappedSession.mint('tool_a');
    cappedSession.mint('tool_b');
    cappedSession.mint('tool_c');
    cappedSession.mint('tool_d');
    expect(cappedSession.size()).toBe(3);
    expect(cappedSession.sourceOf(c1)).toBeUndefined();
  });

  it('evicts canaries older than ttlMs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    const ttlSession = new CanarySession({ ttlMs: 60_000 });
    const c1 = ttlSession.mint('tool_a');
    vi.setSystemTime(new Date(2026, 0, 1, 12, 1, 1));
    const c2 = ttlSession.mint('tool_b');
    expect(ttlSession.sourceOf(c1)).toBeUndefined();
    expect(ttlSession.sourceOf(c2)).toBe('tool_b');
  });
});

import { describe, expect, it } from 'vitest';
import {
  BASE64_MAX_DECODED_BYTES,
  BASE64_MAX_RECURSION_DEPTH,
  collapseWhitespace,
  decodeBase64Substrings,
  decodeHomoglyphs,
  normalizeForScan,
  reverseLeet,
  stripZeroWidth
} from '~/prompt-injection/normalizer.js';

describe('stripZeroWidth (C9 stage 1)', () => {
  it('removes U+200B zero-width space', () => {
    expect(stripZeroWidth('Ignore\u200Bprevious')).toBe('Ignoreprevious');
  });

  it('removes U+200C zero-width non-joiner', () => {
    expect(stripZeroWidth('Ignore\u200Cprevious')).toBe('Ignoreprevious');
  });

  it('removes U+200D zero-width joiner', () => {
    expect(stripZeroWidth('Ignore\u200Dprevious')).toBe('Ignoreprevious');
  });

  it('removes U+FEFF byte order mark', () => {
    expect(stripZeroWidth('\uFEFFIgnore previous')).toBe('Ignore previous');
  });

  it('removes U+2060 word joiner', () => {
    expect(stripZeroWidth('Ig\u2060nore previous')).toBe('Ignore previous');
  });

  it('preserves regular whitespace and newlines', () => {
    expect(stripZeroWidth('Ignore\npre vious')).toBe('Ignore\npre vious');
  });

  it('is a no-op on empty string', () => {
    expect(stripZeroWidth('')).toBe('');
  });

  it('is a no-op on strings with no zero-width chars', () => {
    expect(stripZeroWidth('Ignore previous instructions')).toBe('Ignore previous instructions');
  });
});

describe('decodeHomoglyphs (C9 stage 2)', () => {
  it('applies NFKC normalization to fullwidth Latin (U+FF29 → I)', () => {
    expect(decodeHomoglyphs('\uFF29gnore')).toBe('Ignore');
  });

  it('maps Cyrillic "р" (U+0440) to Latin "p"', () => {
    expect(decodeHomoglyphs('\u0440rompt')).toBe('prompt');
  });

  it('maps Cyrillic "а" (U+0430) to Latin "a"', () => {
    expect(decodeHomoglyphs('ign\u0430re')).toBe('ignare');
  });

  it('maps Greek "ο" (U+03BF) to Latin "o"', () => {
    expect(decodeHomoglyphs('ign\u03BFre')).toBe('ignore');
  });

  it('preserves pure ASCII input unchanged', () => {
    expect(decodeHomoglyphs('Ignore previous instructions')).toBe('Ignore previous instructions');
  });

  it('is a no-op on empty string', () => {
    expect(decodeHomoglyphs('')).toBe('');
  });
});

describe('decodeBase64Substrings (C9 stage 3)', () => {
  it('decodes embedded base64 substring to plain text', () => {
    const encoded = Buffer.from('Ignore previous').toString('base64');
    expect(decodeBase64Substrings(`Read this: ${encoded} instructions`)).toContain('Ignore previous');
  });

  it('leaves plain text unchanged when no base64 substring exists', () => {
    expect(decodeBase64Substrings('just plain text here')).toBe('just plain text here');
  });

  it('does not decode short tokens that happen to be valid base64', () => {
    expect(decodeBase64Substrings('abc xyz')).toBe('abc xyz');
  });

  it('exposes BASE64_MAX_RECURSION_DEPTH = 3 per C9', () => {
    expect(BASE64_MAX_RECURSION_DEPTH).toBe(3);
  });

  it('exposes BASE64_MAX_DECODED_BYTES = 64 KiB per C9', () => {
    expect(BASE64_MAX_DECODED_BYTES).toBe(64 * 1024);
  });

  it('bounds total decoded bytes when fed a 100 KB base64 blob', () => {
    const huge = 'A'.repeat(100_000);
    expect(typeof decodeBase64Substrings(`prefix ${huge} suffix`)).toBe('string');
  });

  it('stops recursing at depth 3 — the 4th encoded layer is not unwrapped', () => {
    let encoded = 'Ignore previous';
    for (let i = 0; i < 4; i++) {
      encoded = Buffer.from(encoded).toString('base64');
    }
    expect(decodeBase64Substrings(encoded)).not.toContain('Ignore previous');
  });
});

describe('reverseLeet (C9 stage 4, ClawGuard _normalize_leet port)', () => {
  it('reverses "1gn0r3" to "ignore"', () => {
    expect(reverseLeet('1gn0r3')).toBe('ignore');
  });

  it('reverses "pr3v10us" to "previous"', () => {
    expect(reverseLeet('pr3v10us')).toBe('previous');
  });

  it('reverses full leet attack phrase to canonical words', () => {
    expect(reverseLeet('1gn0r3 pr3v10us 1nstruct10ns')).toBe('ignore previous instructions');
  });

  it('lowercases while reversing so downstream matching is case-insensitive', () => {
    expect(reverseLeet('IGNORE')).toBe('ignore');
  });

  it('preserves non-leet alphanumerics', () => {
    expect(reverseLeet('Ignore previous')).toBe('ignore previous');
  });
});

describe('collapseWhitespace (C9 stage 5)', () => {
  it('collapses repeated spaces into a single space', () => {
    expect(collapseWhitespace('ignore    previous')).toBe('ignore previous');
  });

  it('collapses mixed tabs and spaces', () => {
    expect(collapseWhitespace('ignore\t \t previous')).toBe('ignore previous');
  });

  it('collapses newlines into spaces', () => {
    expect(collapseWhitespace('ignore\nprevious\ninstructions')).toBe('ignore previous instructions');
  });

  it('trims leading and trailing whitespace', () => {
    expect(collapseWhitespace('  ignore previous  ')).toBe('ignore previous');
  });

  it('is a no-op on already-normalized whitespace', () => {
    expect(collapseWhitespace('ignore previous')).toBe('ignore previous');
  });
});

describe('normalizeForScan: full 5-stage pipeline composition', () => {
  it('handles zero-width + homoglyph combined attack', () => {
    expect(normalizeForScan('\u0440ignore\u200B previous')).toBe('pignore previous');
  });

  it('decodes base64-encoded leet and reverses to canonical phrase', () => {
    const encoded = Buffer.from('1gn0r3 pr3v10us').toString('base64');
    expect(normalizeForScan(`Please: ${encoded} instructions`)).toContain('ignore previous');
  });

  it('handles zero-width injected into the middle of a base64 block', () => {
    const encoded = Buffer.from('Ignore previous').toString('base64');
    const poisoned = `${encoded.slice(0, 5)}\u200B${encoded.slice(5)}`;
    expect(normalizeForScan(`text ${poisoned} text`)).toContain('ignore previous');
  });

  it('collapses whitespace padded through leet, preserving token recovery', () => {
    expect(normalizeForScan('1 g n 0 r 3    p r 3 v 1 0 u s')).toBe('i g n o r e p r e v i o u s');
  });

  it('preserves benign input semantically (case-folded, whitespace-collapsed)', () => {
    expect(normalizeForScan('Read a file from disk')).toBe('read a file from disk');
  });

  it('is deterministic: same input yields same output', () => {
    const input = '\u0440ignore\u200B  previous';
    expect(normalizeForScan(input)).toBe(normalizeForScan(input));
  });

  it('returns empty string unchanged', () => {
    expect(normalizeForScan('')).toBe('');
  });

  it('decodes base64 BEFORE leet reversal, so base64 alphabet survives', () => {
    const encoded = Buffer.from('plan1stageattackflow').toString('base64');
    expect(normalizeForScan(`before ${encoded} after`)).toContain('planistageattackflow');
  });
});

describe('normalizeForScan: perf budget (C10)', () => {
  // Thresholds are 3× the production SLO (C10 targets <5 ms on prod
  // hardware per tools/list). CI runners can be 2–3× slower than local
  // dev; the tests exist to catch order-of-magnitude regressions, not
  // to enforce the wall-clock SLO (which is validated by the perf harness).
  it('processes ~1 KB input under 15 ms', () => {
    const input = 'ignore previous instructions '.repeat(40);
    const start = performance.now();
    normalizeForScan(input);
    expect(performance.now() - start).toBeLessThan(15);
  });

  it('processes ~10 KB input under 75 ms', () => {
    const input = 'ignore previous instructions '.repeat(400);
    const start = performance.now();
    normalizeForScan(input);
    expect(performance.now() - start).toBeLessThan(75);
  });
});

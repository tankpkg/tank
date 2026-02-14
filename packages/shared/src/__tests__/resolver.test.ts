import { describe, it, expect } from 'vitest';
import { resolve, sortVersions } from '../lib/resolver.js';

describe('resolve', () => {
  describe('caret ranges (^)', () => {
    it('returns highest compatible version for ^2.1.0', () => {
      const result = resolve('^2.1.0', ['2.0.0', '2.1.0', '2.1.3', '2.2.0', '3.0.0']);
      expect(result).toBe('2.2.0');
    });

    it('returns null when no version satisfies ^5.0.0', () => {
      const result = resolve('^5.0.0', ['1.0.0', '2.0.0']);
      expect(result).toBeNull();
    });
  });

  describe('tilde ranges (~)', () => {
    it('returns highest patch version for ~2.1.0', () => {
      const result = resolve('~2.1.0', ['2.1.0', '2.1.3', '2.2.0']);
      expect(result).toBe('2.1.3');
    });
  });

  describe('exact version', () => {
    it('returns exact match when available', () => {
      const result = resolve('2.1.0', ['2.1.0', '2.1.3']);
      expect(result).toBe('2.1.0');
    });

    it('returns null when exact version not in list', () => {
      const result = resolve('2.1.0', ['2.0.0', '2.1.3']);
      expect(result).toBeNull();
    });
  });

  describe('wildcard (*)', () => {
    it('returns highest version for *', () => {
      const result = resolve('*', ['1.0.0', '2.0.0', '3.0.0']);
      expect(result).toBe('3.0.0');
    });
  });

  describe('comparison ranges', () => {
    it('returns highest version satisfying >=2.0.0', () => {
      const result = resolve('>=2.0.0', ['1.0.0', '2.0.0', '3.0.0']);
      expect(result).toBe('3.0.0');
    });

    it('returns highest version satisfying <2.0.0', () => {
      const result = resolve('<2.0.0', ['1.0.0', '2.0.0', '3.0.0']);
      expect(result).toBe('1.0.0');
    });
  });

  describe('compound ranges', () => {
    it('returns highest version satisfying >=2.0.0 <3.0.0', () => {
      const result = resolve('>=2.0.0 <3.0.0', ['1.0.0', '2.5.0', '3.0.0']);
      expect(result).toBe('2.5.0');
    });

    it('returns null when no version satisfies compound range', () => {
      const result = resolve('>=4.0.0 <5.0.0', ['1.0.0', '3.0.0', '5.0.0']);
      expect(result).toBeNull();
    });
  });

  describe('pre-release handling', () => {
    it('excludes pre-release versions from range matching', () => {
      const result = resolve('^1.0.0', ['1.0.0', '1.1.0-beta.1', '1.1.0']);
      expect(result).toBe('1.1.0');
    });

    it('includes pre-release when explicitly requested in range', () => {
      const result = resolve('>=1.1.0-beta.1', ['1.0.0', '1.1.0-beta.1', '1.1.0']);
      // semver.maxSatisfying with includePrerelease returns the highest
      expect(result).toBe('1.1.0');
    });

    it('matches exact pre-release version', () => {
      const result = resolve('1.1.0-beta.1', ['1.0.0', '1.1.0-beta.1', '1.1.0']);
      expect(result).toBe('1.1.0-beta.1');
    });
  });

  describe('edge cases', () => {
    it('returns null for empty versions array', () => {
      const result = resolve('^1.0.0', []);
      expect(result).toBeNull();
    });

    it('returns null for invalid range string', () => {
      const result = resolve('not-a-range', ['1.0.0', '2.0.0']);
      expect(result).toBeNull();
    });

    it('returns null for empty range string', () => {
      const result = resolve('', ['1.0.0', '2.0.0']);
      expect(result).toBeNull();
    });

    it('filters out invalid version strings gracefully', () => {
      const result = resolve('^1.0.0', ['1.0.0', 'invalid', '1.2.0', 'also-bad']);
      expect(result).toBe('1.2.0');
    });

    it('returns null when all versions are invalid', () => {
      const result = resolve('^1.0.0', ['invalid', 'also-bad', 'nope']);
      expect(result).toBeNull();
    });

    it('handles single version in array', () => {
      const result = resolve('^1.0.0', ['1.5.0']);
      expect(result).toBe('1.5.0');
    });

    it('does not throw on malformed range', () => {
      expect(() => resolve('>>>=!!!', ['1.0.0'])).not.toThrow();
      expect(resolve('>>>=!!!', ['1.0.0'])).toBeNull();
    });
  });
});

describe('sortVersions', () => {
  it('sorts versions descending (newest first)', () => {
    const result = sortVersions(['1.0.0', '3.0.0', '2.0.0']);
    expect(result).toEqual(['3.0.0', '2.0.0', '1.0.0']);
  });

  it('handles pre-release versions correctly', () => {
    const result = sortVersions(['1.0.0', '1.1.0-beta.1', '1.1.0', '1.0.1']);
    expect(result).toEqual(['1.1.0', '1.1.0-beta.1', '1.0.1', '1.0.0']);
  });

  it('returns empty array for empty input', () => {
    const result = sortVersions([]);
    expect(result).toEqual([]);
  });

  it('filters out invalid versions', () => {
    const result = sortVersions(['2.0.0', 'invalid', '1.0.0']);
    expect(result).toEqual(['2.0.0', '1.0.0']);
  });

  it('does not mutate the original array', () => {
    const original = ['1.0.0', '3.0.0', '2.0.0'];
    const copy = [...original];
    sortVersions(original);
    expect(original).toEqual(copy);
  });
});

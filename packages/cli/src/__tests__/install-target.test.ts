import { describe, expect, it } from 'vitest';

import { looksLikeVersionRange, parseInstallTarget } from '~/lib/install-target.js';

describe('parseInstallTarget', () => {
  it('scoped name without version → name only', () => {
    expect(parseInstallTarget('@org/skill')).toEqual({ kind: 'name', name: '@org/skill' });
  });

  it('scoped name with caret range → name + range', () => {
    expect(parseInstallTarget('@org/skill@^1.0.0')).toEqual({
      kind: 'name',
      name: '@org/skill',
      versionRange: '^1.0.0'
    });
  });

  it('scoped name with exact version → name + range', () => {
    expect(parseInstallTarget('@org/skill@1.2.3')).toEqual({
      kind: 'name',
      name: '@org/skill',
      versionRange: '1.2.3'
    });
  });

  it('unscoped name without version → name only', () => {
    expect(parseInstallTarget('skill')).toEqual({ kind: 'name', name: 'skill' });
  });

  it('unscoped name with version → name + range', () => {
    expect(parseInstallTarget('skill@2.0.0')).toEqual({
      kind: 'name',
      name: 'skill',
      versionRange: '2.0.0'
    });
  });

  it('https URL → url', () => {
    expect(parseInstallTarget('https://github.com/owner/repo')).toEqual({
      kind: 'url',
      url: 'https://github.com/owner/repo'
    });
  });

  it('http URL → url', () => {
    expect(parseInstallTarget('http://example.com/skill.tgz')).toEqual({
      kind: 'url',
      url: 'http://example.com/skill.tgz'
    });
  });

  it('trailing @ with empty range → treated as bare name', () => {
    expect(parseInstallTarget('@org/skill@')).toEqual({ kind: 'name', name: '@org/skill@' });
  });

  it('preserves complex semver ranges (e.g. >=1.0.0 <2.0.0)', () => {
    expect(parseInstallTarget('@org/skill@>=1.0.0 <2.0.0')).toEqual({
      kind: 'name',
      name: '@org/skill',
      versionRange: '>=1.0.0 <2.0.0'
    });
  });
});

describe('looksLikeVersionRange', () => {
  it.each([
    ['^1.0.0', true],
    ['~1', true],
    ['>=2', true],
    ['<2', true],
    ['=1.0.0', true],
    ['1.0.0', true],
    ['1', true],
    ['1.x', true],
    ['*', true],
    ['latest', true],
    ['next', true]
  ])('treats %s as a version range', (input, expected) => {
    expect(looksLikeVersionRange(input)).toBe(expected);
  });

  it.each([
    ['@org/skill', false],
    ['@org/skill@^1.0.0', false],
    ['skill', false],
    ['my-skill', false],
    ['https://github.com/owner/repo', false],
    ['http://example.com', false],
    ['', false]
  ])('treats %s as NOT a version range', (input, expected) => {
    expect(looksLikeVersionRange(input)).toBe(expected);
  });
});

import { describe, expect, it } from 'vitest';

import { describeError } from '~/lib/describe-error.js';

// Regression: Windows users saw `Install failed for @tank/bulletproof: <none>`.
// The renderer collapsed any thrown value to `err.message` (empty for some errors)
// or `String(err)` (a bare placeholder for odd native values). The error message
// must always be non-empty and actionable.
// Validates: idd/modules/install/INTENT.md C18, E20.
describe('describeError (actionable, never empty)', () => {
  it('returns the message for a normal Error', () => {
    expect(describeError(new Error('boom'))).toContain('boom');
  });

  it('never returns an empty string for an Error with no message', () => {
    const result = describeError(new Error(''));

    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('<none>');
  });

  it('includes errno code/syscall/path for filesystem errors', () => {
    const err = Object.assign(new Error('ENOENT: no such file or directory, rename'), {
      code: 'ENOENT',
      syscall: 'rename',
      path: 'C:\\Users\\t_str\\.tank\\skills\\@tank\\bulletproof\\SKILL.md'
    });

    const result = describeError(err);

    expect(result).toContain('ENOENT');
    expect(result).toContain('rename');
    expect(result).toContain('SKILL.md');
  });

  it('describes a thrown non-Error object instead of [object Object]', () => {
    const result = describeError({ reason: 'weird-native-failure' });

    expect(result).not.toBe('[object Object]');
    expect(result).toContain('weird-native-failure');
  });

  it('never renders empty or <none> for any thrown value', () => {
    const weirdValues: unknown[] = [undefined, null, {}, [], new Error(''), { toString: () => '<none>' }, Symbol('x')];

    for (const value of weirdValues) {
      const result = describeError(value);
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toBe('<none>');
    }
  });
});

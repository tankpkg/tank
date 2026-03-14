import { describe, expect, it } from 'vitest';

import { encodeSkillName } from '~/lib/url.js';

describe('encodeSkillName', () => {
  it('keeps @ and / unencoded for scoped names', () => {
    expect(encodeSkillName('@tank/bulletproof')).toBe('@tank/bulletproof');
  });

  it('keeps @ and / for deeply scoped names', () => {
    expect(encodeSkillName('@org/some-skill')).toBe('@org/some-skill');
  });

  it('encodes spaces', () => {
    expect(encodeSkillName('my skill')).toBe('my%20skill');
  });

  it('encodes query-string characters', () => {
    expect(encodeSkillName('skill?v=1')).toBe('skill%3Fv%3D1');
  });

  it('encodes hash characters', () => {
    expect(encodeSkillName('skill#readme')).toBe('skill%23readme');
  });

  it('handles unscoped names unchanged', () => {
    expect(encodeSkillName('simple-skill')).toBe('simple-skill');
  });

  it('handles names with multiple @ and /', () => {
    expect(encodeSkillName('@org/sub/path')).toBe('@org/sub/path');
  });
});

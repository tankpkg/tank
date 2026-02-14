import { describe, it, expect } from 'vitest';
import { REGISTRY_URL } from '../index.js';

describe('shared package', () => {
  it('exports REGISTRY_URL', () => {
    expect(REGISTRY_URL).toBe('https://tankpkg.dev');
  });
});

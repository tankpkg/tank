import { describe, it, expect } from 'vitest';
import { skillsLockSchema } from '../schemas/skills-lock.js';

describe('skillsLockSchema', () => {
  const validLockfile = {
    lockfileVersion: 1,
    skills: {
      '@vercel/next-skill@2.1.0': {
        resolved: 'https://tankpkg.dev/v1/skills/@vercel/next-skill/2.1.0',
        integrity: 'sha512-abc123def456',
        permissions: {
          network: { outbound: ['*.vercel.com'] },
          filesystem: { read: ['./src/**'] },
          subprocess: false,
        },
        audit_score: 8.5,
      },
      '@community/seo-audit@3.0.0': {
        resolved: 'https://tankpkg.dev/v1/skills/@community/seo-audit/3.0.0',
        integrity: 'sha512-xyz789',
        permissions: {},
        audit_score: null,
      },
    },
  };

  it('accepts valid lockfile', () => {
    const result = skillsLockSchema.safeParse(validLockfile);
    expect(result.success).toBe(true);
  });

  it('accepts lockfile with empty skills', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
      skills: {},
    });
    expect(result.success).toBe(true);
  });

  it('accepts lockfile with null audit_score', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
      skills: {
        'test-skill@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test-skill/1.0.0',
          integrity: 'sha512-abc',
          permissions: {},
          audit_score: null,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing lockfileVersion', () => {
    const result = skillsLockSchema.safeParse({
      skills: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong lockfileVersion', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 2,
      skills: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid integrity (not sha512-)', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
      skills: {
        'test@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test/1.0.0',
          integrity: 'sha256-abc123',
          permissions: {},
          audit_score: null,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects integrity without any prefix', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
      skills: {
        'test@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test/1.0.0',
          integrity: 'abc123',
          permissions: {},
          audit_score: null,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid resolved URL', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
      skills: {
        'test@1.0.0': {
          resolved: 'not-a-url',
          integrity: 'sha512-abc123',
          permissions: {},
          audit_score: null,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing skills field', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects audit_score out of range (above 10)', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
      skills: {
        'test@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test/1.0.0',
          integrity: 'sha512-abc123',
          permissions: {},
          audit_score: 11,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects audit_score out of range (below 0)', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
      skills: {
        'test@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test/1.0.0',
          integrity: 'sha512-abc123',
          permissions: {},
          audit_score: -1,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing permissions in locked skill', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
      skills: {
        'test@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test/1.0.0',
          integrity: 'sha512-abc123',
          audit_score: null,
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

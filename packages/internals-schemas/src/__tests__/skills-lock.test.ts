import { describe, expect, it } from 'vitest';

import { skillsLockSchema } from '~/schemas/skills-lock.js';

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
          subprocess: false
        },
        audit_score: 8.5
      },
      '@community/seo-audit@3.0.0': {
        resolved: 'https://tankpkg.dev/v1/skills/@community/seo-audit/3.0.0',
        integrity: 'sha512-xyz789',
        permissions: {},
        audit_score: null
      }
    }
  };

  it('accepts valid lockfile', () => {
    const result = skillsLockSchema.safeParse(validLockfile);
    expect(result.success).toBe(true);
  });

  it('accepts lockfile with empty skills', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
      skills: {}
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
          audit_score: null
        }
      }
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing lockfileVersion', () => {
    const result = skillsLockSchema.safeParse({
      skills: {}
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong lockfileVersion', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 99,
      skills: {}
    });
    expect(result.success).toBe(false);
  });

  it('accepts lockfileVersion 2', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 2,
      skills: {}
    });
    expect(result.success).toBe(true);
  });

  it('accepts v2 lockfile with dependencies field', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 2,
      skills: {
        '@test/skill@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test-skill/1.0.0',
          integrity: 'sha512-abc',
          permissions: {},
          audit_score: 8.0,
          dependencies: { '@dep/helper': '1.2.0' }
        }
      }
    });
    expect(result.success).toBe(true);
  });

  it('accepts v2 lockfile without dependencies field (optional)', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 2,
      skills: {
        '@test/skill@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test-skill/1.0.0',
          integrity: 'sha512-abc',
          permissions: {},
          audit_score: null
        }
      }
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid integrity (not sha512-)', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1,
      skills: {
        'test@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test/1.0.0',
          integrity: 'sha256-abc123',
          permissions: {},
          audit_score: null
        }
      }
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
          audit_score: null
        }
      }
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
          audit_score: null
        }
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing skills field', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 1
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
          audit_score: 11
        }
      }
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
          audit_score: -1
        }
      }
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
          audit_score: null
        }
      }
    });
    expect(result.success).toBe(false);
  });

  it('accepts lockfile entry with source, scan_verdict, and scanned_at', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 2,
      skills: {
        '@org/url-skill@1.0.0': {
          resolved: 'https://github.com/org/url-skill/archive/v1.0.0.tar.gz',
          integrity: 'sha512-abc123',
          permissions: { subprocess: false },
          audit_score: 7.5,
          source: 'github',
          scan_verdict: 'pass',
          scanned_at: '2026-04-15T12:00:00.000Z'
        }
      }
    });
    expect(result.success).toBe(true);
  });

  it('accepts lockfile entry without new source tracking fields (backward compat)', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 2,
      skills: {
        '@test/legacy@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test-legacy/1.0.0',
          integrity: 'sha512-xyz',
          permissions: {},
          audit_score: 9.0
        }
      }
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid source value', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 2,
      skills: {
        '@test/skill@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test/1.0.0',
          integrity: 'sha512-abc',
          permissions: {},
          audit_score: null,
          source: 'unknown_source'
        }
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid scan_verdict value', () => {
    const result = skillsLockSchema.safeParse({
      lockfileVersion: 2,
      skills: {
        '@test/skill@1.0.0': {
          resolved: 'https://tankpkg.dev/v1/skills/test/1.0.0',
          integrity: 'sha512-abc',
          permissions: {},
          audit_score: null,
          scan_verdict: 'maybe'
        }
      }
    });
    expect(result.success).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { skillsJsonSchema } from '../schemas/skills-json.js';

describe('skillsJsonSchema', () => {
  const validManifest = {
    name: 'my-skill',
    version: '1.0.0',
    description: 'A test skill',
    skills: {
      '@vercel/next-skill': '^2.1.0',
      '@community/seo-audit': '3.0.0',
    },
    permissions: {
      network: { outbound: ['*.anthropic.com'] },
      filesystem: { read: ['./src/**'], write: ['./output/**'] },
      subprocess: false,
    },
    audit: { min_score: 7 },
  };

  it('accepts valid manifest with all fields', () => {
    const result = skillsJsonSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  it('accepts valid manifest with only required fields (name, version)', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('accepts scoped name @org/skill', () => {
    const result = skillsJsonSchema.safeParse({
      name: '@my-org/my-skill',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('accepts unscoped name my-skill', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '0.1.0',
    });
    expect(result.success).toBe(true);
  });

  it('accepts semver with prerelease', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0-beta.1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts semver with build metadata', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0+build.123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects uppercase name @ORG/test', () => {
    const result = skillsJsonSchema.safeParse({
      name: '@ORG/test',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name with uppercase letters', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'MySkill',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name too long (215 chars)', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'a'.repeat(215),
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('accepts name at max length (214 chars)', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'a'.repeat(214),
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = skillsJsonSchema.safeParse({
      name: '',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid semver version', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: 'not-semver',
    });
    expect(result.success).toBe(false);
  });

  it('rejects version with v prefix', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: 'v1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects version with only major.minor', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects permission with unknown field (strict)', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
      permissions: {
        secrets: ['API_KEY'],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects audit min_score above 10', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
      audit: { min_score: 11 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects audit min_score below 0', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
      audit: { min_score: -1 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts audit min_score at boundaries (0 and 10)', () => {
    expect(skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
      audit: { min_score: 0 },
    }).success).toBe(true);

    expect(skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
      audit: { min_score: 10 },
    }).success).toBe(true);
  });

  it('rejects description over 500 chars', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
      description: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts description at exactly 500 chars', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
      description: 'a'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid repository URL', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
      repository: 'https://github.com/user/repo',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repository).toBe('https://github.com/user/repo');
    }
  });

  it('accepts manifest without repository (optional)', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repository).toBeUndefined();
    }
  });

  it('rejects invalid repository URL', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
      repository: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level field (strict)', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
      version: '1.0.0',
      unknown_field: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects name with spaces', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my skill',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing version', () => {
    const result = skillsJsonSchema.safeParse({
      name: 'my-skill',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = skillsJsonSchema.safeParse({
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });
});

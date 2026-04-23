import { describe, expect, it } from 'vitest';
import { CREDENTIAL_PATTERNS } from '../detector/patterns.ts';
import { scan } from '../detector/scanner.ts';

describe('detector', () => {
  describe('pattern registry', () => {
    it('contains at least 8 patterns covering major credential types', () => {
      const ids = CREDENTIAL_PATTERNS.map((p) => p.id);
      expect(ids).toContain('stripe_secret');
      expect(ids).toContain('stripe_publishable');
      expect(ids).toContain('aws_access_key');
      expect(ids).toContain('github_pat');
      expect(ids).toContain('github_oauth');
      expect(ids).toContain('openai_key');
      expect(ids).toContain('elevenlabs_key');
      expect(ids).toContain('jwt_token');
    });
  });

  describe('scan() — detection by prefix + structure', () => {
    it('detects Stripe secret key', () => {
      const matches = scan('Use this key: sk_live_4eC39HqLyjWDarjtT1zdp7dc');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('stripe_secret');
      expect(matches[0]?.start).toBe(15);
      expect(matches[0]?.end).toBe(47);
    });

    it('detects Stripe test key', () => {
      const matches = scan('Test key: sk_test_51OeR2LjTyQwGUvn');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('stripe_secret');
    });

    it('detects Stripe publishable key', () => {
      const matches = scan('pk_live_TYooMQauvdEDq54NiTphI7jx');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('stripe_publishable');
    });

    it('detects AWS access key', () => {
      const matches = scan('My key is AKIAIOSFODNN7EXAMPLE');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('aws_access_key');
    });

    it('detects GitHub personal access token', () => {
      const matches = scan('Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('github_pat');
    });

    it('detects GitHub OAuth token', () => {
      const matches = scan('gho_16C7e42F292c6912E7710c838347Ae178B4a');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('github_oauth');
    });

    it('detects OpenAI API key', () => {
      const matches = scan('sk-proj-abc123def456ghi789jkl012mno345pqr678');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('openai_key');
    });

    it('detects ElevenLabs API key', () => {
      const matches = scan('elvn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('elevenlabs_key');
    });

    it('detects JWT token', () => {
      const matches = scan(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('jwt_token');
    });

    it('detects database connection string', () => {
      const matches = scan('postgresql://admin:s3cretP@ss@db.example.com:5432/mydb');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('database_url');
    });

    it('detects Slack webhook URL', () => {
      const matches = scan('https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('slack_webhook');
    });
  });

  describe('scan() — no false positives', () => {
    it('returns no matches for regular text', () => {
      expect(scan('No credentials here, just regular text')).toHaveLength(0);
    });

    it('returns no matches for URLs', () => {
      expect(scan('The API base URL is https://api.anthropic.com')).toHaveLength(0);
    });

    it('returns no matches for short strings sharing a prefix', () => {
      expect(scan('sk_live is a prefix but this is too short')).toHaveLength(0);
    });

    it('returns no matches for empty string', () => {
      expect(scan('')).toHaveLength(0);
    });
  });

  describe('scan() — multiple credentials', () => {
    it('detects multiple credentials in the same text', () => {
      const matches = scan('Two keys: sk_live_abc123def456ghi789 and elvn_xyz789uvw456rst123opq');
      expect(matches).toHaveLength(2);
      expect(matches[0]?.patternId).toBe('stripe_secret');
      expect(matches[1]?.patternId).toBe('elevenlabs_key');
    });

    it('detects two identical credentials at different positions', () => {
      const matches = scan('First: sk_live_4eC39HqLyjWDarjtT1zdp7dc and again: sk_live_4eC39HqLyjWDarjtT1zdp7dc');
      expect(matches).toHaveLength(2);
      expect(matches[0]?.start).not.toBe(matches[1]?.start);
    });
  });

  describe('scan() — edge cases', () => {
    it('detects credential embedded in JSON', () => {
      const matches = scan('{"api_key": "sk_live_4eC39HqLyjWDarjtT1zdp7dc", "model": "gpt-4"}');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('stripe_secret');
    });

    it('detects credential concatenated in code without whitespace', () => {
      const matches = scan("const key='sk_live_4eC39HqLyjWDarjtT1zdp7dc';fetch(url)");
      expect(matches).toHaveLength(1);
    });

    it('detects credential in markdown code block', () => {
      const matches = scan('```bash\nexport STRIPE_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc\n```');
      expect(matches).toHaveLength(1);
    });

    it('detects credential in URL query parameter', () => {
      const matches = scan('https://api.example.com/webhook?token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.patternId).toBe('github_pat');
    });

    it('detects credential at the start of text', () => {
      const matches = scan('sk_live_4eC39HqLyjWDarjtT1zdp7dc is the key');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.start).toBe(0);
    });

    it('detects credential at the end of text', () => {
      const text = 'The key is sk_live_4eC39HqLyjWDarjtT1zdp7dc';
      const matches = scan(text);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.end).toBe(text.length);
    });

    it('detects credential surrounded by unicode', () => {
      const matches = scan('API-Schlüssel: sk_live_4eC39HqLyjWDarjtT1zdp7dc を使用してください');
      expect(matches).toHaveLength(1);
    });

    it('does not match invalid character patterns', () => {
      expect(scan('sk_live_this-has-dashes-which-are-not-valid!!!!')).toHaveLength(0);
    });
  });

  describe('scan() — safety (C3)', () => {
    it('match result contains span and patternId but not the credential value', () => {
      const matches = scan('Secret: sk_live_4eC39HqLyjWDarjtT1zdp7dc');
      expect(matches).toHaveLength(1);
      const match = matches[0]!;
      expect(match).toHaveProperty('start');
      expect(match).toHaveProperty('end');
      expect(match).toHaveProperty('patternId');
      expect(Object.keys(match)).toHaveLength(3);
    });
  });
});

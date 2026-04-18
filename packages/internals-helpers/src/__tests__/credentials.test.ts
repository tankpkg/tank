import { describe, expect, it } from 'vitest';
import type { ScanMode } from '~/credentials/index.js';
import {
  CREDENTIAL_PATTERNS,
  DEFAULT_ENTROPY_THRESHOLD_BITS_PER_CHAR,
  scan,
  shannonEntropy
} from '~/credentials/index.js';

describe('credentials: pattern registry', () => {
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

describe('credentials.scan(): detection by prefix + structure', () => {
  it('detects Stripe secret key', () => {
    const matches = scan('Use this key: sk_live_4eC39HqLyjWDarjtT1zdp7dc');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('stripe_secret');
    expect(matches[0]!.start).toBe(15);
    expect(matches[0]!.end).toBe(47);
  });

  it('detects Stripe test key', () => {
    const matches = scan('Test key: sk_test_51OeR2LjTyQwGUvn');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('stripe_secret');
  });

  it('detects Stripe publishable key', () => {
    const matches = scan('pk_live_TYooMQauvdEDq54NiTphI7jx');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('stripe_publishable');
  });

  it('detects AWS access key', () => {
    const matches = scan('My key is AKIAZJ5QK2VXN7FP3WRB');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('aws_access_key');
  });

  it('detects GitHub personal access token', () => {
    const matches = scan('Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('github_pat');
  });

  it('detects GitHub OAuth token', () => {
    const matches = scan('gho_16C7e42F292c6912E7710c838347Ae178B4a');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('github_oauth');
  });

  it('detects OpenAI API key', () => {
    const matches = scan('sk-proj-abc123def456ghi789jkl012mno345pqr678');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('openai_key');
  });

  it('detects ElevenLabs API key', () => {
    const matches = scan('elvn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('elevenlabs_key');
  });

  it('detects JWT token', () => {
    const matches = scan(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('jwt_token');
  });

  it('detects database connection string', () => {
    const matches = scan('postgresql://admin:s3cretP@ss@db.example.com:5432/mydb');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('database_url');
  });

  it('detects Slack webhook URL', () => {
    const matches = scan('https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('slack_webhook');
  });
});

describe('credentials.scan(): no false positives', () => {
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

describe('credentials.scan(): multiple credentials', () => {
  it('detects multiple credentials in the same text', () => {
    const matches = scan('Two keys: sk_live_abc123def456ghi789 and elvn_xyz789uvw456rst123opq');
    expect(matches).toHaveLength(2);
    expect(matches[0]!.patternId).toBe('stripe_secret');
    expect(matches[1]!.patternId).toBe('elevenlabs_key');
  });

  it('detects two identical credentials at different positions', () => {
    const matches = scan('First: sk_live_4eC39HqLyjWDarjtT1zdp7dc and again: sk_live_4eC39HqLyjWDarjtT1zdp7dc');
    expect(matches).toHaveLength(2);
    expect(matches[0]!.start).not.toBe(matches[1]!.start);
  });
});

describe('credentials.scan(): edge cases', () => {
  it('detects credential embedded in JSON', () => {
    const matches = scan('{"api_key": "sk_live_4eC39HqLyjWDarjtT1zdp7dc", "model": "gpt-4"}');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('stripe_secret');
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
    expect(matches[0]!.patternId).toBe('github_pat');
  });

  it('detects credential at the start of text', () => {
    const matches = scan('sk_live_4eC39HqLyjWDarjtT1zdp7dc is the key');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.start).toBe(0);
  });

  it('detects credential at the end of text', () => {
    const text = 'The key is sk_live_4eC39HqLyjWDarjtT1zdp7dc';
    const matches = scan(text);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.end).toBe(text.length);
  });

  it('detects credential surrounded by unicode', () => {
    const matches = scan('API-Schlüssel: sk_live_4eC39HqLyjWDarjtT1zdp7dc を使用してください');
    expect(matches).toHaveLength(1);
  });

  it('does not match invalid character patterns', () => {
    expect(scan('sk_live_this-has-dashes-which-are-not-valid!!!!')).toHaveLength(0);
  });
});

describe('credentials.scan(): safety (C3)', () => {
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

describe('credentials.scan(): entropy gate (C25a)', () => {
  it('rejects low-entropy stripe match (all same char in body)', () => {
    expect(scan('sk_live_aaaaaaaaaaaaaaaa')).toHaveLength(0);
  });

  it('rejects low-entropy github PAT (two-character alternation)', () => {
    expect(scan('ghp_abababababababababababababababababab')).toHaveLength(0);
  });

  it('accepts structural JWT even with low-entropy body', () => {
    const matches = scan('eyJhbhbhbhbhbhbhb.eyJabababababab.dozjgNryP4J3jVm');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('jwt_token');
  });

  it('accepts structural database URL (exempt from entropy gate)', () => {
    const matches = scan('postgresql://a:a@aaaa.example.com:5432/a');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('database_url');
  });

  it('override threshold replaces per-pattern minEntropy (can loosen)', () => {
    const matches = scan('sk_live_aaaaaaaaaaaaaaaa', { entropyThreshold: 0 });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('stripe_secret');
  });

  it('override threshold replaces per-pattern minEntropy (can tighten)', () => {
    expect(scan('elvn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4', { entropyThreshold: 5.0 })).toHaveLength(0);
  });

  it('override does not affect structural patterns', () => {
    const matches = scan('postgresql://a:a@aaaa.example.com:5432/a', { entropyThreshold: 10 });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('database_url');
  });
});

describe('credentials.scan(): placeholder denylist (AWS docs-example keys)', () => {
  it('rejects AWS docs-example key via EXAMPLE substring', () => {
    expect(scan('AKIAIOSFODNN7EXAMPLE')).toHaveLength(0);
  });

  it('rejects stripe key containing PLACEHOLDER substring', () => {
    expect(scan('sk_live_PLACEHOLDER1234567890')).toHaveLength(0);
  });

  it('rejects github PAT containing YOUR_KEY substring', () => {
    expect(scan('ghp_YOUR_KEYabcdefghijklmnopqrstuvwxyz123')).toHaveLength(0);
  });

  it('denylist is case-insensitive', () => {
    expect(scan('AKIAexampleABCDEFGHIJ')).toHaveLength(0);
  });

  it('structural patterns ignore denylist (no denylist configured)', () => {
    const matches = scan('postgresql://EXAMPLE:EXAMPLE@example.com:5432/EXAMPLE');
    expect(matches).toHaveLength(1);
  });
});

describe('credentials.scan(): per-pattern entropy thresholds (C25a)', () => {
  it('AWS threshold (3.3) rejects body below p5', () => {
    expect(scan('AKIAABABABABABABABAB')).toHaveLength(0);
  });

  it('github_oauth threshold (3.75) rejects body below p5', () => {
    expect(scan('gho_abcabcabcabcabcabcabcabcabcabcabcabc')).toHaveLength(0);
  });

  it('github_pat threshold (4.4) rejects body that passes 3.3 but not 4.4', () => {
    expect(scan('ghp_abcdefabcdefabcdefabcdefabcdefabcdef')).toHaveLength(0);
  });

  it('openai_key threshold (4.5) rejects body that passes 4.0 but not 4.5', () => {
    expect(scan('sk-proj-abcdefghij12abcdefghij12abcde')).toHaveLength(0);
  });
});

describe('credentials.scan(): permissive mode (vault profile)', () => {
  const permissive: { mode: ScanMode } = { mode: 'permissive' };

  it('accepts low-entropy stripe body that strict rejects', () => {
    expect(scan('sk_live_aaaaaaaaaaaaaaaa')).toHaveLength(0);
    const matches = scan('sk_live_aaaaaaaaaaaaaaaa', permissive);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('stripe_secret');
  });

  it('accepts AWS docs-example key that strict rejects via placeholder denylist', () => {
    expect(scan('AKIAIOSFODNN7EXAMPLE')).toHaveLength(0);
    const matches = scan('AKIAIOSFODNN7EXAMPLE', permissive);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('aws_access_key');
  });

  it('accepts github PAT with EXAMPLE placeholder that strict rejects', () => {
    const input = 'ghp_EXAMPLEabcdefghijklmnopqrstuvwxyz123';
    expect(scan(input)).toHaveLength(0);
    const matches = scan(input, permissive);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('github_pat');
  });

  it('accepts github_pat body below per-pattern entropy floor that strict rejects', () => {
    expect(scan('ghp_abcdefabcdefabcdefabcdefabcdefabcdef')).toHaveLength(0);
    const matches = scan('ghp_abcdefabcdefabcdefabcdefabcdefabcdef', permissive);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe('github_pat');
  });

  it('structural JWT passes in both modes', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(scan(jwt)).toHaveLength(1);
    expect(scan(jwt, permissive)).toHaveLength(1);
  });

  it('structural database URL passes in both modes', () => {
    const url = 'postgresql://admin:s3cretP@ss@db.example.com:5432/mydb';
    expect(scan(url)).toHaveLength(1);
    expect(scan(url, permissive)).toHaveLength(1);
  });

  it('still returns no match when regex does not match (permissive is not a bypass)', () => {
    expect(scan('no credentials here', permissive)).toHaveLength(0);
    expect(scan('sk_live is a prefix but this is too short', permissive)).toHaveLength(0);
  });

  it('default (no options) behaves as strict', () => {
    expect(scan('sk_live_aaaaaaaaaaaaaaaa')).toHaveLength(0);
    expect(scan('sk_live_aaaaaaaaaaaaaaaa', {})).toHaveLength(0);
    expect(scan('sk_live_aaaaaaaaaaaaaaaa', { mode: 'strict' })).toHaveLength(0);
  });

  it('permissive mode ignores entropyThreshold override that would reject in strict', () => {
    expect(scan('elvn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4', { entropyThreshold: 5.0 })).toHaveLength(0);
    expect(scan('elvn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4', { mode: 'permissive', entropyThreshold: 5.0 })).toHaveLength(1);
  });
});

describe('credentials.shannonEntropy', () => {
  it('returns 0 for empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });

  it('returns 0 for single repeated char', () => {
    expect(shannonEntropy('aaaaaaaa')).toBe(0);
  });

  it('returns 1 bit/char for 50/50 two-char alternation', () => {
    expect(shannonEntropy('abababab')).toBeCloseTo(1, 5);
  });

  it('returns log2(n) for uniformly distributed n unique chars', () => {
    expect(shannonEntropy('abcdefgh')).toBeCloseTo(3, 5);
  });

  it('exposes a default threshold above 4 bits/char', () => {
    expect(DEFAULT_ENTROPY_THRESHOLD_BITS_PER_CHAR).toBeGreaterThanOrEqual(4);
  });
});

import { describe, expect, it } from 'vitest';
import { generateFake } from '../tokenizer/generator.ts';
import { VaultStore } from '../tokenizer/vault.ts';

describe('generateFake()', () => {
  describe('format preservation', () => {
    it('fake Stripe key preserves sk_live_ prefix and length', () => {
      const real = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';
      const fake = generateFake(real, 'stripe_secret');
      expect(fake).toMatch(/^sk_live_/);
      expect(fake).toHaveLength(real.length);
      expect(fake).not.toBe(real);
      expect(fake.slice(8)).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('fake AWS key preserves AKIA prefix and length', () => {
      const real = 'AKIAIOSFODNN7EXAMPLE';
      const fake = generateFake(real, 'aws_access_key');
      expect(fake).toMatch(/^AKIA/);
      expect(fake).toHaveLength(real.length);
      expect(fake.slice(4)).toMatch(/^[A-Z0-9]+$/);
    });

    it('fake GitHub PAT preserves ghp_ prefix and length', () => {
      const real = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234';
      const fake = generateFake(real, 'github_pat');
      expect(fake).toMatch(/^ghp_/);
      expect(fake).toHaveLength(real.length);
    });

    it('fake ElevenLabs key preserves elvn_ prefix and length', () => {
      const real = 'elvn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4';
      const fake = generateFake(real, 'elevenlabs_key');
      expect(fake).toMatch(/^elvn_/);
      expect(fake).toHaveLength(real.length);
    });

    it('fake OpenAI key preserves sk-proj- prefix and length', () => {
      const real = 'sk-proj-abc123def456ghi789jkl012mno345pqr678';
      const fake = generateFake(real, 'openai_key');
      expect(fake).toMatch(/^sk-proj-/);
      expect(fake).toHaveLength(real.length);
    });
  });

  describe('uniqueness', () => {
    it('different real tokens produce different fakes', () => {
      const fake1 = generateFake('sk_live_aaaaaaaaaaaaaaaaaaaaaa', 'stripe_secret');
      const fake2 = generateFake('sk_live_bbbbbbbbbbbbbbbbbbbbbb', 'stripe_secret');
      expect(fake1).not.toBe(fake2);
      expect(fake1).toMatch(/^sk_live_/);
      expect(fake2).toMatch(/^sk_live_/);
    });

    it('500 fakes are all unique', () => {
      const fakes = new Set<string>();
      for (let i = 0; i < 500; i++) {
        const real = `sk_live_${String(i).padStart(24, '0')}`;
        fakes.add(generateFake(real, 'stripe_secret'));
      }
      expect(fakes.size).toBe(500);
    });
  });

  describe('randomness (C8)', () => {
    it('fake suffix has no long substring overlap with real suffix', () => {
      const real = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';
      const fake = generateFake(real, 'stripe_secret');
      const realSuffix = real.slice(8);
      const fakeSuffix = fake.slice(8);
      for (let len = 5; len <= realSuffix.length; len++) {
        for (let i = 0; i <= realSuffix.length - len; i++) {
          expect(fakeSuffix).not.toContain(realSuffix.slice(i, i + len));
        }
      }
    });
  });
});

describe('VaultStore', () => {
  describe('bidirectional mapping', () => {
    it('stores and retrieves in both directions', () => {
      const vault = new VaultStore();
      vault.store('sk_live_REAL123', 'sk_live_FAKE456', 'stripe_secret');
      expect(vault.lookupReal('sk_live_REAL123')).toBe('sk_live_FAKE456');
      expect(vault.lookupFake('sk_live_FAKE456')).toBe('sk_live_REAL123');
    });

    it('stores multiple mappings without collision', () => {
      const vault = new VaultStore();
      vault.store('sk_live_AAA', 'sk_live_XXX', 'stripe_secret');
      vault.store('AKIAEXAMPLE1', 'AKIAFAKEKEY2', 'aws_access_key');
      expect(vault.size).toBe(2);
      expect(vault.lookupFake('sk_live_XXX')).toBe('sk_live_AAA');
      expect(vault.lookupFake('AKIAFAKEKEY2')).toBe('AKIAEXAMPLE1');
    });

    it('returns null for unknown values', () => {
      const vault = new VaultStore();
      expect(vault.lookupReal('sk_live_DOESNOTEXIST')).toBeNull();
      expect(vault.lookupFake('sk_live_DOESNOTEXIST')).toBeNull();
    });
  });

  describe('session scoping', () => {
    it('clear() empties the vault', () => {
      const vault = new VaultStore();
      vault.store('a', 'x', 'test');
      vault.store('b', 'y', 'test');
      vault.store('c', 'z', 'test');
      expect(vault.size).toBe(3);
      vault.clear();
      expect(vault.size).toBe(0);
      expect(vault.lookupReal('a')).toBeNull();
    });
  });

  describe('idempotency', () => {
    it('storing same mapping twice is idempotent', () => {
      const vault = new VaultStore();
      vault.store('sk_live_AAA', 'sk_live_XXX', 'stripe_secret');
      vault.store('sk_live_AAA', 'sk_live_XXX', 'stripe_secret');
      expect(vault.size).toBe(1);
    });

    it('updating a mapping replaces the fake', () => {
      const vault = new VaultStore();
      vault.store('sk_live_AAA', 'sk_live_OLD', 'stripe_secret');
      vault.store('sk_live_AAA', 'sk_live_NEW', 'stripe_secret');
      expect(vault.size).toBe(1);
      expect(vault.lookupReal('sk_live_AAA')).toBe('sk_live_NEW');
      expect(vault.lookupFake('sk_live_OLD')).toBeNull();
      expect(vault.lookupFake('sk_live_NEW')).toBe('sk_live_AAA');
    });
  });

  describe('bulk operations', () => {
    it('redact() replaces all real credentials with fakes', () => {
      const vault = new VaultStore();
      vault.store('sk_live_REAL1', 'sk_live_FAKE1', 'stripe_secret');
      vault.store('AKIAEXAMPLE', 'AKIAFAKEFAKE', 'aws_access_key');
      const result = vault.redact('Use sk_live_REAL1 and AKIAEXAMPLE');
      expect(result).toBe('Use sk_live_FAKE1 and AKIAFAKEFAKE');
    });

    it('restore() replaces all fake credentials with reals', () => {
      const vault = new VaultStore();
      vault.store('sk_live_REAL1', 'sk_live_FAKE1', 'stripe_secret');
      vault.store('AKIAEXAMPLE', 'AKIAFAKEFAKE', 'aws_access_key');
      const result = vault.restore("curl -H 'Bearer sk_live_FAKE1' --key AKIAFAKEFAKE");
      expect(result).toBe("curl -H 'Bearer sk_live_REAL1' --key AKIAEXAMPLE");
    });

    it('redact() returns unchanged text when no matches', () => {
      const vault = new VaultStore();
      vault.store('sk_live_REAL1', 'sk_live_FAKE1', 'stripe_secret');
      expect(vault.redact('No credentials in this text')).toBe('No credentials in this text');
    });
  });
});

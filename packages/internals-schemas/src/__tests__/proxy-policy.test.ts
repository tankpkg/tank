import { describe, expect, it } from 'vitest';
import { proxyPolicySchema } from '~/schemas/proxy-policy.js';

describe('proxyPolicySchema (D16)', () => {
  it('accepts an empty object', () => {
    expect(proxyPolicySchema.safeParse({}).success).toBe(true);
  });

  it('accepts every defaulted field at its expected type', () => {
    const result = proxyPolicySchema.safeParse({
      perfBudgetMs: 5,
      blockOnMatch: true,
      resetPinsOnMismatch: false
    });
    expect(result.success).toBe(true);
  });

  it('accepts a perTool map with override fields', () => {
    const result = proxyPolicySchema.safeParse({
      perTool: { readFile: { scan: true, blockOnMatch: false } }
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-number perfBudgetMs', () => {
    expect(proxyPolicySchema.safeParse({ perfBudgetMs: '5' }).success).toBe(false);
  });

  it('rejects a non-positive perfBudgetMs', () => {
    expect(proxyPolicySchema.safeParse({ perfBudgetMs: 0 }).success).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(proxyPolicySchema.safeParse({ unknownField: true }).success).toBe(false);
  });

  it('rejects unknown per-tool override keys (strict)', () => {
    expect(proxyPolicySchema.safeParse({ perTool: { x: { banana: true } } }).success).toBe(false);
  });
});

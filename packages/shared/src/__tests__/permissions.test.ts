import { describe, it, expect } from 'vitest';
import { permissionsSchema } from '../schemas/permissions.js';

describe('permissionsSchema', () => {
  it('accepts valid permissions with all fields', () => {
    const result = permissionsSchema.safeParse({
      network: { outbound: ['*.example.com', 'api.openai.com'] },
      filesystem: { read: ['./src/**'], write: ['./output/**'] },
      subprocess: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty permissions object', () => {
    const result = permissionsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts permissions with only network', () => {
    const result = permissionsSchema.safeParse({
      network: { outbound: ['*.anthropic.com'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts permissions with only filesystem', () => {
    const result = permissionsSchema.safeParse({
      filesystem: { read: ['./data/**'], write: ['./tmp/**'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts permissions with only subprocess', () => {
    const result = permissionsSchema.safeParse({
      subprocess: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts network with empty outbound array', () => {
    const result = permissionsSchema.safeParse({
      network: { outbound: [] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts filesystem with only read', () => {
    const result = permissionsSchema.safeParse({
      filesystem: { read: ['./src/**'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts filesystem with only write', () => {
    const result = permissionsSchema.safeParse({
      filesystem: { write: ['./output/**'] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown permission field (secrets)', () => {
    const result = permissionsSchema.safeParse({
      secrets: ['API_KEY'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown permission field (rate_limit)', () => {
    const result = permissionsSchema.safeParse({
      rate_limit: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown network field (inbound)', () => {
    const result = permissionsSchema.safeParse({
      network: { outbound: [], inbound: ['*'] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown filesystem field (execute)', () => {
    const result = permissionsSchema.safeParse({
      filesystem: { read: [], execute: ['./bin/**'] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects subprocess with non-boolean value', () => {
    const result = permissionsSchema.safeParse({
      subprocess: 'yes',
    });
    expect(result.success).toBe(false);
  });
});

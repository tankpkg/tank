import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyApiKey = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

vi.mock('../auth', () => ({
  auth: {
    api: {
      verifyApiKey: (...args: unknown[]) => mockVerifyApiKey(...args),
    },
  },
}));

vi.mock('../db', () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...args: unknown[]) => {
          mockFrom(...args);
          return {
            where: (...args: unknown[]) => {
              mockWhere(...args);
              return {
                orderBy: (...args: unknown[]) => {
                  mockOrderBy(...args);
                  return {
                    limit: (...args: unknown[]) => mockLimit(...args),
                  };
                },
              };
            },
          };
        },
      };
    },
  },
}));

import { verifyCliAuth } from '../auth-helpers';

describe('verifyCliAuth', () => {
  beforeEach(() => {
    mockVerifyApiKey.mockReset();
    mockSelect.mockReset();
    mockFrom.mockReset();
    mockWhere.mockReset();
    mockOrderBy.mockReset();
    mockLimit.mockReset();
    // Default: user is not blocked (no userStatus records = active)
    mockLimit.mockResolvedValue([]);
  });

  it('returns null when Authorization header is missing', async () => {
    const request = new Request('http://localhost:3000/api/test');
    const result = await verifyCliAuth(request);
    expect(result).toBeNull();
    expect(mockVerifyApiKey).not.toHaveBeenCalled();
  });

  it('returns null when Authorization header is not Bearer', async () => {
    const request = new Request('http://localhost:3000/api/test', {
      headers: { Authorization: 'Basic abc123' },
    });
    const result = await verifyCliAuth(request);
    expect(result).toBeNull();
    expect(mockVerifyApiKey).not.toHaveBeenCalled();
  });

  it('returns null when Bearer token is empty', async () => {
    const request = new Request('http://localhost:3000/api/test', {
      headers: { Authorization: 'Bearer ' },
    });
    const result = await verifyCliAuth(request);
    expect(result).toBeNull();
    expect(mockVerifyApiKey).not.toHaveBeenCalled();
  });

  it('extracts Bearer token and calls verifyApiKey', async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { id: 'key-123', userId: 'user-456' },
    });

    const request = new Request('http://localhost:3000/api/test', {
      headers: { Authorization: 'Bearer tank_abc123' },
    });
    const result = await verifyCliAuth(request);

    expect(mockVerifyApiKey).toHaveBeenCalledWith({ body: { key: 'tank_abc123' } });
    expect(result).toEqual({ userId: 'user-456', keyId: 'key-123' });
  });

  it('returns null when verifyApiKey returns invalid', async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false });

    const request = new Request('http://localhost:3000/api/test', {
      headers: { Authorization: 'Bearer tank_invalid' },
    });
    const result = await verifyCliAuth(request);

    expect(result).toBeNull();
  });

  it('returns null when verifyApiKey returns valid but no key', async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: true, key: null });

    const request = new Request('http://localhost:3000/api/test', {
      headers: { Authorization: 'Bearer tank_nokey' },
    });
    const result = await verifyCliAuth(request);

    expect(result).toBeNull();
  });

  it('returns null when verifyApiKey throws', async () => {
    mockVerifyApiKey.mockRejectedValue(new Error('DB connection failed'));

    const request = new Request('http://localhost:3000/api/test', {
      headers: { Authorization: 'Bearer tank_error' },
    });
    const result = await verifyCliAuth(request);

    expect(result).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNpmsScore } from '../clients/npms-client';

describe('fetchNpmsScore', () => {
  const mockResponse = {
    score: {
      final: 0.85,
      detail: { quality: 0.9, popularity: 0.8, maintenance: 0.85 }
    },
    collected: {
      metadata: { name: 'lodash', version: '4.17.21' }
    }
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns package health scores on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    } as Response);

    const result = await fetchNpmsScore('lodash');

    expect(result).toEqual({
      name: 'lodash',
      quality: 0.9,
      popularity: 0.8,
      maintenance: 0.85,
      overallScore: 0.85
    });
  });

  it('returns null for 404 (package not found)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404
    } as Response);

    const result = await fetchNpmsScore('nonexistent-package-xyz');
    expect(result).toBeNull();
  });

  it('returns null on network error after retries', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const result = await fetchNpmsScore('lodash');
    expect(result).toBeNull();
  });

  it('returns null on invalid response schema', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ invalid: true })
    } as Response);

    const result = await fetchNpmsScore('lodash');
    expect(result).toBeNull();
  });
});

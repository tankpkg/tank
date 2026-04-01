import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOsvVulnerabilities } from '../clients/osv-client';

describe('fetchOsvVulnerabilities', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty map for empty queries', async () => {
    const result = await fetchOsvVulnerabilities([]);
    expect(result.size).toBe(0);
  });

  it('maps OSV response to VulnerabilityInfo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              vulns: [
                {
                  id: 'GHSA-1234',
                  summary: 'Test vulnerability',
                  severity: [{ score: '9.5', type: 'CVSS_V3' }],
                  references: [{ type: 'ADVISORY', url: 'https://github.com/advisories/GHSA-1234' }]
                }
              ]
            }
          ]
        })
    } as Response);

    const result = await fetchOsvVulnerabilities([{ packageName: 'lodash', version: '4.17.20', ecosystem: 'npm' }]);

    expect(result.size).toBe(1);
    const vulns = result.get('lodash')!;
    expect(vulns).toHaveLength(1);
    expect(vulns[0]).toMatchObject({
      id: 'GHSA-1234',
      severity: 'critical',
      title: 'Test vulnerability',
      packageName: 'lodash'
    });
  });

  it('returns empty map on network error after retries', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const result = await fetchOsvVulnerabilities([{ packageName: 'lodash', version: '4.17.20', ecosystem: 'npm' }]);

    expect(result.size).toBe(0);
  });

  it('handles missing vulns array gracefully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [{}]
        })
    } as Response);

    const result = await fetchOsvVulnerabilities([{ packageName: 'lodash', version: '4.17.20', ecosystem: 'npm' }]);

    expect(result.size).toBe(1);
    expect(result.get('lodash')).toEqual([]);
  });
});

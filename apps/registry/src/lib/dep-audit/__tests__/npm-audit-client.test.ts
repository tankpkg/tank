import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNpmAuditVulnerabilities } from '../clients/npm-audit-client';

describe('fetchNpmAuditVulnerabilities', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty map for empty packages', async () => {
    const result = await fetchNpmAuditVulnerabilities([]);
    expect(result.size).toBe(0);
  });

  it('maps npm audit advisories to VulnerabilityInfo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          '1673': {
            id: 1673,
            title: 'Prototype Pollution',
            severity: 'high',
            url: 'https://npmjs.com/advisories/1673',
            cwe: ['CWE-400'],
            findings: [{ paths: ['lodash'] }]
          }
        })
    } as Response);

    const result = await fetchNpmAuditVulnerabilities([{ name: 'lodash', version: '4.17.20' }]);

    expect(result.size).toBe(1);
    const vulns = result.get('lodash')!;
    expect(vulns).toHaveLength(1);
    expect(vulns[0]).toMatchObject({
      id: 'npm-audit-1673',
      severity: 'high',
      title: 'Prototype Pollution',
      packageName: 'lodash'
    });
  });

  it('returns empty map on 404 (no advisories)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404
    } as Response);

    const result = await fetchNpmAuditVulnerabilities([{ name: 'safe-package', version: '1.0.0' }]);

    expect(result.size).toBe(0);
  });

  it('returns empty map on network error after retries', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const result = await fetchNpmAuditVulnerabilities([{ name: 'lodash', version: '4.17.20' }]);

    expect(result.size).toBe(0);
  });
});

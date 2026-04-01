import { describe, expect, it } from 'vitest';
import type { NpmsResult } from '../clients/npms-client';
import { buildReport } from '../report-builder';
import type { VulnerabilityInfo } from '../types';

describe('buildReport', () => {
  it('returns clean report for no dependencies', () => {
    const report = buildReport({
      deps: [],
      npmsScores: new Map(),
      osvVulns: new Map(),
      npmAuditVulns: new Map(),
      sourcesAvailable: { npms: true, osv: true, npmAudit: true }
    });

    expect(report.ecosystem).toBe('none');
    expect(report.packageCount).toBe(0);
    expect(report.vulnerableCount).toBe(0);
    expect(report.tldr).toBe('No dependencies found');
    expect(report.healthScore).toBe(1.0);
    expect(report.status).toBe('completed');
  });

  it('builds report with npms scores and no vulns', () => {
    const npmsScores = new Map<string, NpmsResult>();
    npmsScores.set('lodash', {
      name: 'lodash',
      quality: 0.9,
      popularity: 0.95,
      maintenance: 0.8,
      overallScore: 0.88
    });

    const report = buildReport({
      deps: [{ name: 'lodash', version: '4.17.21', ecosystem: 'npm' }],
      npmsScores,
      osvVulns: new Map(),
      npmAuditVulns: new Map(),
      sourcesAvailable: { npms: true, osv: true, npmAudit: true }
    });

    expect(report.packageCount).toBe(1);
    expect(report.vulnerableCount).toBe(0);
    expect(report.tldr).toBe('1 package, no vulnerabilities');
    expect(report.healthScore).toBeCloseTo(0.88, 1);
    expect(report.packages[0].quality).toBe(0.9);
    expect(report.status).toBe('completed');
  });

  it('deduplicates vulns by CVE ID across sources', () => {
    const sharedVuln: VulnerabilityInfo = {
      id: 'GHSA-123',
      cve: 'CVE-2024-0001',
      severity: 'high',
      title: 'Test vuln',
      url: 'https://example.com',
      packageName: 'lodash',
      version: '4.17.20'
    };

    const osvVulns = new Map<string, VulnerabilityInfo[]>();
    osvVulns.set('lodash', [sharedVuln]);

    const npmAuditVulns = new Map<string, VulnerabilityInfo[]>();
    npmAuditVulns.set('lodash', [
      {
        ...sharedVuln,
        id: 'npm-audit-456',
        cve: 'CVE-2024-0001' // Same CVE, different source ID
      }
    ]);

    const report = buildReport({
      deps: [{ name: 'lodash', version: '4.17.20', ecosystem: 'npm' }],
      npmsScores: new Map(),
      osvVulns,
      npmAuditVulns,
      sourcesAvailable: { npms: true, osv: true, npmAudit: true }
    });

    expect(report.vulnerableCount).toBe(1); // Deduplicated
  });

  it('generates tldr with severity breakdown', () => {
    const vulns: VulnerabilityInfo[] = [
      { id: '1', cve: null, severity: 'critical', title: 'V1', url: null, packageName: 'a', version: '1.0' },
      { id: '2', cve: null, severity: 'high', title: 'V2', url: null, packageName: 'b', version: '1.0' },
      { id: '3', cve: null, severity: 'medium', title: 'V3', url: null, packageName: 'c', version: '1.0' }
    ];

    const osvVulns = new Map<string, VulnerabilityInfo[]>();
    osvVulns.set('a', [vulns[0]]);
    osvVulns.set('b', [vulns[1]]);
    osvVulns.set('c', [vulns[2]]);

    const report = buildReport({
      deps: [
        { name: 'a', version: '1.0', ecosystem: 'npm' },
        { name: 'b', version: '1.0', ecosystem: 'npm' },
        { name: 'c', version: '1.0', ecosystem: 'npm' }
      ],
      npmsScores: new Map(),
      osvVulns,
      npmAuditVulns: new Map(),
      sourcesAvailable: { npms: true, osv: true, npmAudit: true }
    });

    expect(report.tldr).toContain('3 vulnerabilities');
    expect(report.tldr).toContain('1 critical');
    expect(report.tldr).toContain('1 high');
    expect(report.tldr).toContain('1 medium');
    expect(report.vulnSummary).toEqual({ critical: 1, high: 1, medium: 1, low: 0 });
  });

  it('returns partial_failure status when some sources fail', () => {
    const report = buildReport({
      deps: [{ name: 'lodash', version: '4.17.20', ecosystem: 'npm' }],
      npmsScores: new Map(),
      osvVulns: new Map(),
      npmAuditVulns: new Map(),
      sourcesAvailable: { npms: true, osv: false, npmAudit: false }
    });

    expect(report.status).toBe('partial_failure');
  });

  it('returns failed status when all sources fail', () => {
    const report = buildReport({
      deps: [{ name: 'lodash', version: '4.17.20', ecosystem: 'npm' }],
      npmsScores: new Map(),
      osvVulns: new Map(),
      npmAuditVulns: new Map(),
      sourcesAvailable: { npms: false, osv: false, npmAudit: false }
    });

    expect(report.status).toBe('failed');
  });

  it('reduces health score with vuln penalties', () => {
    const npmsScores = new Map<string, NpmsResult>();
    npmsScores.set('lodash', {
      name: 'lodash',
      quality: 0.9,
      popularity: 0.9,
      maintenance: 0.9,
      overallScore: 0.9
    });

    const osvVulns = new Map<string, VulnerabilityInfo[]>();
    osvVulns.set('lodash', [
      { id: '1', cve: null, severity: 'critical', title: 'V1', url: null, packageName: 'lodash', version: '4.17.20' }
    ]);

    const report = buildReport({
      deps: [{ name: 'lodash', version: '4.17.20', ecosystem: 'npm' }],
      npmsScores,
      osvVulns,
      npmAuditVulns: new Map(),
      sourcesAvailable: { npms: true, osv: true, npmAudit: true }
    });

    expect(report.healthScore).toBeLessThan(0.9);
    expect(report.healthScore).toBeGreaterThan(0);
  });
});

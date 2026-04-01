// ── Dependency Audit Types ────────────────────────────────────────────────────
// Shared types for the dep-audit module. All downstream modules import from here.

export type DepEcosystem = 'npm' | 'pypi';

export interface Dependency {
  name: string;
  version: string;
  ecosystem: DepEcosystem;
}

export interface PackageHealth {
  name: string;
  version: string;
  quality: number | null; // 0-1 from npms.io
  popularity: number | null; // 0-1 from npms.io
  maintenance: number | null; // 0-1 from npms.io
  overallScore: number | null; // 0-1 weighted average
}

export interface VulnerabilityInfo {
  id: string; // OSV ID or npm advisory ID
  cve: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  url: string | null;
  packageName: string;
  version: string;
}

export type DepAuditStatus = 'pending' | 'completed' | 'partial_failure' | 'failed';

export interface VulnSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DepAuditReport {
  ecosystem: 'npm' | 'pypi' | 'mixed' | 'none';
  packageCount: number;
  vulnerableCount: number;
  vulnSummary: VulnSummary;
  packages: Array<{
    name: string;
    version: string;
    quality: number | null;
    popularity: number | null;
    maintenance: number | null;
    overallScore: number | null;
    vulns: Array<{
      id: string;
      cve: string | null;
      severity: string;
      title: string;
      url: string | null;
    }>;
  }>;
  tldr: string;
  healthScore: number; // 0-1
  sources: { npms: boolean; osv: boolean; npmAudit: boolean };
  status: DepAuditStatus;
}

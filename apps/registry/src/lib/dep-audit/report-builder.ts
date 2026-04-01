import type { NpmsResult } from './clients/npms-client';
import { detectEcosystem } from './parser';
import type { DepAuditReport, Dependency, VulnerabilityInfo } from './types';

interface ReportInput {
  deps: Dependency[];
  npmsScores: Map<string, NpmsResult>;
  osvVulns: Map<string, VulnerabilityInfo[]>;
  npmAuditVulns: Map<string, VulnerabilityInfo[]>;
  sourcesAvailable: { npms: boolean; osv: boolean; npmAudit: boolean };
}

/**
 * Merge data from all sources into a structured DepAuditReport.
 *
 * Handles:
 * - Deduplication of vulns by CVE/ID across sources
 * - Health score computation (weighted npms scores - vuln penalties)
 * - tldr generation
 * - Partial failure detection
 */
export function buildReport(input: ReportInput): DepAuditReport {
  const { deps, npmsScores, osvVulns, npmAuditVulns, sourcesAvailable } = input;
  const ecosystem = detectEcosystem(deps);

  if (deps.length === 0) {
    return {
      ecosystem: 'none',
      packageCount: 0,
      vulnerableCount: 0,
      vulnSummary: { critical: 0, high: 0, medium: 0, low: 0 },
      packages: [],
      tldr: 'No dependencies found',
      healthScore: 1.0,
      sources: sourcesAvailable,
      status: 'completed'
    };
  }

  // Build per-package data
  const packages: DepAuditReport['packages'] = [];
  const allVulns: VulnerabilityInfo[] = [];
  const seenVulnIds = new Set<string>();

  for (const dep of deps) {
    const npms = npmsScores.get(dep.name);
    const osvVulnsForPkg = osvVulns.get(dep.name) ?? [];
    const npmAuditVulnsForPkg = npmAuditVulns.get(dep.name) ?? [];

    // Deduplicate vulns by ID across sources
    const mergedVulns: DepAuditReport['packages'][0]['vulns'] = [];

    for (const vuln of [...osvVulnsForPkg, ...npmAuditVulnsForPkg]) {
      const dedupeKey = vuln.cve ?? vuln.id;
      if (seenVulnIds.has(dedupeKey)) continue;
      seenVulnIds.add(dedupeKey);

      mergedVulns.push({
        id: vuln.id,
        cve: vuln.cve,
        severity: vuln.severity,
        title: vuln.title,
        url: vuln.url
      });

      allVulns.push(vuln);
    }

    const quality = npms?.quality ?? null;
    const popularity = npms?.popularity ?? null;
    const maintenance = npms?.maintenance ?? null;
    const overallScore = npms?.overallScore ?? computeFallbackScore(quality, popularity, maintenance);

    packages.push({
      name: dep.name,
      version: dep.version,
      quality,
      popularity,
      maintenance,
      overallScore,
      vulns: mergedVulns
    });
  }

  // Compute vulnerability summary
  const vulnSummary = {
    critical: allVulns.filter((v) => v.severity === 'critical').length,
    high: allVulns.filter((v) => v.severity === 'high').length,
    medium: allVulns.filter((v) => v.severity === 'medium').length,
    low: allVulns.filter((v) => v.severity === 'low').length
  };

  const vulnerableCount = allVulns.length;

  // Compute health score
  const healthScore = computeHealthScore(packages, allVulns);

  // Generate tldr
  const tldr = generateTldr(allVulns, vulnSummary, deps.length);

  // Determine status
  const anySourceAvailable = sourcesAvailable.npms || sourcesAvailable.osv || sourcesAvailable.npmAudit;
  if (!anySourceAvailable) {
    return {
      ecosystem,
      packageCount: deps.length,
      vulnerableCount: 0,
      vulnSummary,
      packages,
      tldr,
      healthScore,
      sources: sourcesAvailable,
      status: 'failed' as const
    };
  }
  const allSucceeded = sourcesAvailable.npms && sourcesAvailable.osv && sourcesAvailable.npmAudit;
  const status = allSucceeded ? 'completed' : 'partial_failure';

  return {
    ecosystem,
    packageCount: deps.length,
    vulnerableCount,
    vulnSummary,
    packages,
    tldr,
    healthScore,
    sources: sourcesAvailable,
    status
  };
}

function computeFallbackScore(
  quality: number | null,
  popularity: number | null,
  maintenance: number | null
): number | null {
  const scores = [quality, popularity, maintenance].filter((s): s is number => s !== null);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Health score: weighted average of npms scores minus vuln penalties.
 * Range: 0.0 - 1.0
 */
function computeHealthScore(packages: DepAuditReport['packages'], vulns: VulnerabilityInfo[]): number {
  // Base score from npms data
  const scoresWithValues = packages.map((p) => p.overallScore).filter((s): s is number => s !== null);

  let baseScore: number;
  if (scoresWithValues.length > 0) {
    baseScore = scoresWithValues.reduce((a, b) => a + b, 0) / scoresWithValues.length;
  } else {
    baseScore = 0.5; // Neutral default when no npms data
  }

  // Vuln penalties
  const penalties =
    vulns.filter((v) => v.severity === 'critical').length * 0.15 +
    vulns.filter((v) => v.severity === 'high').length * 0.1 +
    vulns.filter((v) => v.severity === 'medium').length * 0.05 +
    vulns.filter((v) => v.severity === 'low').length * 0.02;

  return Math.max(0, Math.min(1, baseScore - penalties));
}

function generateTldr(
  vulns: VulnerabilityInfo[],
  summary: { critical: number; high: number; medium: number; low: number },
  packageCount: number
): string {
  if (vulns.length === 0) {
    return `${packageCount} ${packageCount === 1 ? 'package' : 'packages'}, no vulnerabilities`;
  }

  const parts: string[] = [];
  if (summary.critical > 0) parts.push(`${summary.critical} critical`);
  if (summary.high > 0) parts.push(`${summary.high} high`);
  if (summary.medium > 0) parts.push(`${summary.medium} medium`);
  if (summary.low > 0) parts.push(`${summary.low} low`);

  const topVulns = vulns.filter((v) => v.severity === 'critical' || v.severity === 'high').slice(0, 3);

  const vulnDetail = topVulns.map((v) => `${v.packageName}@${v.version}`).join(', ');

  let tldr = `${vulns.length} ${vulns.length === 1 ? 'vulnerability' : 'vulnerabilities'}: ${parts.join(', ')}`;
  if (vulnDetail) {
    tldr += ` in ${vulnDetail}`;
  }

  // Cap at 200 chars to keep badge/UI rendering reasonable
  if (tldr.length > 200) {
    tldr = `${tldr.slice(0, 197)}...`;
  }

  return tldr;
}

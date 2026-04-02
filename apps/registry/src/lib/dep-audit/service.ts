import { eq } from 'drizzle-orm';

import { db } from '~/lib/db';
import { depAuditResults } from '~/lib/db/schema';

import { fetchNpmAuditVulnerabilities } from './clients/npm-audit-client';
import type { NpmsResult } from './clients/npms-client';
import { fetchNpmsScoresBatch } from './clients/npms-client';
import { fetchOsvVulnerabilities } from './clients/osv-client';
import { parseDependencies } from './parser';
import { buildReport } from './report-builder';
import type { DepAuditReport } from './types';

/**
 * Orchestration service for dependency auditing.
 * Parse → Fetch → Build → Store. Never throws.
 */
export class DepAuditService {
  /**
   * Run a full dependency audit for a skill version.
   * Non-blocking side effect — errors are stored as status='failed'.
   */
  async runAudit(versionId: string, manifest: Record<string, unknown>): Promise<void> {
    try {
      // 1. Parse dependencies from manifest
      const deps = parseDependencies(manifest);

      // 2. If no deps → store clean report
      if (deps.length === 0) {
        const cleanReport = buildReport({
          deps: [],
          npmsScores: new Map(),
          osvVulns: new Map(),
          npmAuditVulns: new Map(),
          sourcesAvailable: { npms: true, osv: true, npmAudit: true }
        });

        await this.storeResult(versionId, cleanReport);
        return;
      }

      // 3. Fetch from all sources in parallel
      const [npmsResult, osvResult, npmAuditResult] = await Promise.allSettled([
        this.fetchNpms(deps),
        this.fetchOsv(deps),
        this.fetchNpmAudit(deps)
      ]);

      const npmsScores = npmsResult.status === 'fulfilled' ? npmsResult.value : new Map();
      const osvVulns = osvResult.status === 'fulfilled' ? osvResult.value : new Map();
      const npmAuditVulns = npmAuditResult.status === 'fulfilled' ? npmAuditResult.value : new Map();

      const sourcesAvailable = {
        npms: npmsResult.status === 'fulfilled',
        osv: osvResult.status === 'fulfilled',
        npmAudit: npmAuditResult.status === 'fulfilled'
      };

      // 4. Build merged report
      const report = buildReport({
        deps,
        npmsScores,
        osvVulns,
        npmAuditVulns,
        sourcesAvailable
      });

      // 5. Store result
      await this.storeResult(versionId, report);
    } catch (_error) {
      // Store failure status — never let audit break the publish
      try {
        await this.storeResult(versionId, {
          ecosystem: 'none',
          packageCount: 0,
          vulnerableCount: 0,
          vulnSummary: { critical: 0, high: 0, medium: 0, low: 0 },
          packages: [],
          tldr: 'Dependency audit failed',
          healthScore: 0,
          sources: { npms: false, osv: false, npmAudit: false },
          status: 'failed'
        });
      } catch {
        // Even storage failed — nothing more to do
      }
    }
  }

  private async fetchNpms(deps: Array<{ name: string; version: string }>): Promise<Map<string, NpmsResult>> {
    return fetchNpmsScoresBatch(deps);
  }

  private async fetchOsv(deps: Array<{ name: string; version: string; ecosystem: string }>) {
    const queries = deps.map((d) => ({
      packageName: d.name,
      version: d.version,
      ecosystem: d.ecosystem === 'pypi' ? 'PyPI' : 'npm'
    }));
    return fetchOsvVulnerabilities(queries);
  }

  private async fetchNpmAudit(deps: Array<{ name: string; version: string; ecosystem: string }>) {
    // npm audit only works for npm packages
    const npmDeps = deps.filter((d) => d.ecosystem === 'npm');
    return fetchNpmAuditVulnerabilities(npmDeps);
  }

  private async storeResult(versionId: string, report: DepAuditReport): Promise<void> {
    // Delete any previous audit for this version before inserting fresh.
    // Prevents unbounded row accumulation on admin rescan.
    await db.delete(depAuditResults).where(eq(depAuditResults.versionId, versionId));
    await db.insert(depAuditResults).values({
      versionId,
      ecosystem: report.ecosystem,
      packageCount: report.packageCount,
      vulnerableCount: report.vulnerableCount,
      vulnSummary: report.vulnSummary,
      packages: report.packages,
      tldr: report.tldr,
      healthScore: report.healthScore,
      sourcesQueried: report.sources,
      status: report.status
    });
  }
}

/** Singleton instance for use across the app. */
export const depAuditService = new DepAuditService();

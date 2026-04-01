import { z } from 'zod';
import type { VulnerabilityInfo } from '../types';

const npmAdvisorySchema = z
  .object({
    id: z.number(),
    title: z.string(),
    severity: z.string(),
    url: z.string().optional(),
    cwe: z.array(z.string()).optional(),
    cves: z.array(z.string()).optional(),
    findings: z
      .array(
        z.object({
          version: z.string().optional(),
          paths: z.array(z.string()).optional()
        })
      )
      .optional()
  })
  .passthrough();

const npmAuditResponseSchema = z.record(z.string(), npmAdvisorySchema);

const TIMEOUT_MS = 5000;

/**
 * Query npm audit API for vulnerabilities.
 * Never throws — returns empty array on failure.
 */
export async function fetchNpmAuditVulnerabilities(
  packages: Array<{ name: string; version: string }>,
  signal?: AbortSignal
): Promise<Map<string, VulnerabilityInfo[]>> {
  const results = new Map<string, VulnerabilityInfo[]>();

  if (packages.length === 0) return results;

  // Build the dependency tree structure npm audit expects
  const dependencies: Record<string, Record<string, string>> = {};
  for (const pkg of packages) {
    dependencies[pkg.name] = { version: pkg.version };
  }

  const body = { dependencies };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
        method: 'POST',
        signal: signal ?? controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 404) return results; // No advisories
        if (response.status === 400) return results; // Bad request
        continue; // Retry on server errors
      }

      const parsed = npmAuditResponseSchema.safeParse(await response.json());
      if (!parsed.success) return results;

      const advisories = parsed.data;
      for (const [, advisory] of Object.entries(advisories)) {
        // Determine affected packages from advisory findings paths
        const affectedPackages = packages.filter((p) =>
          advisory.findings?.some((f) => f.paths?.some((path) => path.includes(p.name)))
        );

        // Skip advisory if we can't determine which package it affects —
        // assigning to ALL packages causes false positives
        if (affectedPackages.length === 0) continue;

        for (const pkg of affectedPackages) {
          const existing = results.get(pkg.name) ?? [];

          existing.push({
            id: `npm-audit-${advisory.id}`,
            cve: advisory.cves?.[0] ?? null,
            severity: normalizeSeverity(advisory.severity),
            title: advisory.title,
            url: advisory.url ?? null,
            packageName: pkg.name,
            version: pkg.version
          });

          results.set(pkg.name, existing);
        }
      }

      return results;
    } catch {
      if (signal?.aborted) return results;
    }
  }

  return results;
}

function normalizeSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
  const lower = severity.toLowerCase();
  if (lower === 'critical') return 'critical';
  if (lower === 'high') return 'high';
  if (lower === 'medium' || lower === 'moderate') return 'medium';
  if (lower === 'low') return 'low';
  if (lower === 'info') return 'low';
  return 'medium';
}

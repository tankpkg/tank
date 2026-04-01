import { z } from 'zod';
import type { VulnerabilityInfo } from '../types';

const osvVulnerabilitySchema = z
  .object({
    id: z.string(),
    summary: z.string().optional(),
    details: z.string().optional(),
    references: z
      .array(
        z.object({
          type: z.string().optional(),
          url: z.string()
        })
      )
      .optional(),
    severity: z
      .array(
        z.object({
          score: z.string().optional(),
          type: z.string().optional()
        })
      )
      .optional(),
    database_specific: z.record(z.string(), z.unknown()).optional(),
    affected: z
      .array(
        z
          .object({
            package: z
              .object({
                name: z.string(),
                ecosystem: z.string(),
                purl: z.string().optional()
              })
              .optional(),
            ranges: z.array(z.unknown()).optional(),
            versions: z.array(z.string()).optional()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough();

const osvQueryResponseSchema = z.object({
  results: z.array(
    z
      .object({
        vulns: z.array(osvVulnerabilitySchema).optional()
      })
      .passthrough()
  )
});

const TIMEOUT_MS = 5000;

export interface OsvQuery {
  packageName: string;
  version: string;
  ecosystem: string; // 'npm' or 'PyPI'
}

/**
 * Query OSV.dev for vulnerabilities in batch.
 * Never throws — returns empty array on failure.
 */
export async function fetchOsvVulnerabilities(
  queries: OsvQuery[],
  signal?: AbortSignal
): Promise<Map<string, VulnerabilityInfo[]>> {
  const results = new Map<string, VulnerabilityInfo[]>();

  if (queries.length === 0) return results;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        signal: signal ?? controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: queries.map((q) => ({
            package: {
              name: q.packageName,
              ecosystem: q.ecosystem,
              ...(q.version !== '*' ? { version: q.version } : {})
            }
          }))
        })
      });

      clearTimeout(timeout);

      if (!response.ok) continue;

      const parsed = osvQueryResponseSchema.safeParse(await response.json());
      if (!parsed.success) return results;

      const data = parsed.data;
      for (let i = 0; i < data.results.length && i < queries.length; i++) {
        const query = queries[i];
        const vulns = data.results[i].vulns ?? [];

        const mapped: VulnerabilityInfo[] = vulns.map((vuln) => {
          const severity = normalizeSeverity(extractSeverity(vuln.severity, vuln.database_specific));

          return {
            id: vuln.id,
            cve: extractCve(vuln.id, vuln.references),
            severity,
            title: vuln.summary ?? vuln.id,
            url: vuln.references?.[0]?.url ?? `https://osv.dev/vulnerability/${vuln.id}`,
            packageName: query.packageName,
            version: query.version
          };
        });

        results.set(query.packageName, mapped);
      }

      return results;
    } catch {
      if (signal?.aborted) return results;
    }
  }

  return results;
}

function extractSeverity(
  severityArray?: Array<{ score?: string; type?: string }>,
  dbSpecific?: Record<string, unknown>
): string {
  // Try CVSS score first
  if (severityArray) {
    for (const s of severityArray) {
      if (s.type?.startsWith('CVSS')) {
        return cvssToSeverity(s.score);
      }
    }
  }

  // Fall back to database_specific severity
  if (dbSpecific?.severity) {
    return normalizeSeverity(String(dbSpecific.severity));
  }

  return 'medium';
}

function cvssToSeverity(score?: string): string {
  if (!score) return 'medium';
  const num = Number.parseFloat(score);
  if (num >= 9.0) return 'critical';
  if (num >= 7.0) return 'high';
  if (num >= 4.0) return 'medium';
  return 'low';
}

function normalizeSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
  const lower = severity.toLowerCase();
  if (lower === 'critical') return 'critical';
  if (lower === 'high') return 'high';
  if (lower === 'medium' || lower === 'moderate') return 'medium';
  if (lower === 'low') return 'low';
  return 'medium';
}

function extractCve(osvId: string, references?: Array<{ type?: string; url: string }>): string | null {
  // OSV IDs that are CVEs
  if (osvId.startsWith('CVE-')) return osvId;

  // Look for CVE in references
  if (references) {
    for (const ref of references) {
      const match = ref.url.match(/\/(CVE-\d{4}-\d+)/);
      if (match) return match[1];
    }
  }

  return null;
}

import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SkillsLock } from '@tank/shared';
import { z } from 'zod';
import { TankApiClient } from '../lib/api-client.js';

const SCOPED_NAME_PATTERN = /^@[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;

interface VersionDetails {
  name: string;
  version: string;
  permissions?: {
    network?: { outbound?: string[] };
    filesystem?: { read?: string[]; write?: string[] };
    subprocess?: boolean;
  };
  auditScore: number | null;
  auditStatus: string;
  downloadUrl: string;
  publishedAt: string;
  downloads: number;
}

interface ScanFinding {
  stage: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location: string | null;
}

interface ScanResult {
  verdict: string;
  audit_score: number;
  findings: ScanFinding[];
  scanned_at: string;
}

interface SkillMetaResponse {
  name: string;
  description: string | null;
  latestVersion: string;
  auditScore: number | null;
  auditStatus: string;
  versions: Array<{
    version: string;
    auditScore: number | null;
    auditStatus: string;
    publishedAt: string;
  }>;
}

function parseLockKey(key: string): { name: string; version: string } | null {
  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0) return null;
  return { name: key.slice(0, lastAt), version: key.slice(lastAt + 1) };
}

function deriveVerdict(score: number | null, status: string): string {
  if (status !== 'completed' || score === null) return 'PENDING';
  if (score >= 7) return 'PASS';
  if (score >= 4) return 'FLAGGED';
  return 'FAIL';
}

function formatFindings(findings: ScanFinding[]): string {
  if (findings.length === 0) return '';

  const bySeverity: Record<string, ScanFinding[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };

  for (const f of findings) {
    if (bySeverity[f.severity]) {
      bySeverity[f.severity].push(f);
    }
  }

  const lines: string[] = ['', `### Findings (${findings.length})`];

  for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
    const group = bySeverity[severity];
    if (group.length === 0) continue;
    lines.push(`\n**${severity.toUpperCase()} (${group.length}):**`);
    for (const f of group) {
      lines.push(`- ${f.type}: ${f.description}${f.location ? ` (${f.location})` : ''}`);
    }
  }

  return lines.join('\n');
}

export function registerAuditSkillTool(server: McpServer): void {
  server.tool(
    'audit-skill',
    'Show security audit results for a skill from the Tank registry.',
    {
      name: z.string().describe('Skill name in @org/name format'),
      version: z.string().optional().describe('Specific version to audit (defaults to installed or latest)'),
    },
    async ({ name, version }) => {
      if (!SCOPED_NAME_PATTERN.test(name)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Validation error: Skill name "${name}" must use the @org/name format (e.g. @acme/my-skill).`,
          }],
          isError: true,
        };
      }

      const client = new TankApiClient();
      if (!client.isAuthenticated) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Authentication required. Please run the "login" tool first to authenticate with Tank.',
          }],
          isError: true,
        };
      }

      const encodedName = encodeURIComponent(name);

      // If no version specified, try to find installed version from lockfile
      let targetVersion = version;
      if (!targetVersion) {
        const lockPath = path.join(process.cwd(), 'skills.lock');
        if (fs.existsSync(lockPath)) {
          try {
            const raw = fs.readFileSync(lockPath, 'utf-8');
            const lock = JSON.parse(raw) as SkillsLock;
            for (const key of Object.keys(lock.skills)) {
              const parsed = parseLockKey(key);
              if (parsed && parsed.name === name) {
                targetVersion = parsed.version;
                break;
              }
            }
          } catch {
            // Lockfile unreadable — fall through to fetch latest
          }
        }
      }

      // If still no version, fetch skill metadata to get latest
      if (!targetVersion) {
        const metaResult = await client.fetch<SkillMetaResponse>(
          `/api/v1/skills/${encodedName}`,
        );

        if (!metaResult.ok) {
          if (metaResult.status === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: 'Unable to connect to the Tank registry. Check your network connection and try again.',
              }],
              isError: true,
            };
          }
          if (metaResult.status === 404) {
            return {
              content: [{
                type: 'text' as const,
                text: `Skill "${name}" not found in the Tank registry.`,
              }],
              isError: true,
            };
          }
          return {
            content: [{
              type: 'text' as const,
              text: `Failed to fetch skill metadata: ${metaResult.error}`,
            }],
            isError: true,
          };
        }

        targetVersion = metaResult.data.latestVersion;
      }

      // Fetch version details with audit data
      const versionResult = await client.fetch<VersionDetails>(
        `/api/v1/skills/${encodedName}/${targetVersion}`,
      );

      if (!versionResult.ok) {
        if (versionResult.status === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Unable to connect to the Tank registry. Check your network connection and try again.',
            }],
            isError: true,
          };
        }
        if (versionResult.status === 404) {
          return {
            content: [{
              type: 'text' as const,
              text: `Skill "${name}" version "${targetVersion}" not found in the Tank registry.`,
            }],
            isError: true,
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: `Failed to fetch audit data: ${versionResult.error}`,
          }],
          isError: true,
        };
      }

      const details = versionResult.data;
      const verdict = deriveVerdict(details.auditScore, details.auditStatus);

      if (details.auditStatus !== 'completed') {
        return {
          content: [{
            type: 'text' as const,
            text: [
              `## Audit: ${name}@${targetVersion}`,
              '',
              `**Status:** Pending security review`,
              `**Scan Status:** ${details.auditStatus}`,
              '',
              'This skill has not yet been through security scanning. Results will be available once the scan completes.',
            ].join('\n'),
          }],
        };
      }

      // Try to fetch detailed scan results
      let findingsText = '';
      const scanResult = await client.fetch<ScanResult>(
        `/api/v1/skills/${encodedName}/${targetVersion}/scan`,
      );
      if (scanResult.ok && scanResult.data.findings) {
        findingsText = formatFindings(scanResult.data.findings);
      }

      const score = details.auditScore !== null ? details.auditScore.toFixed(1) : 'N/A';

      const lines = [
        `## Audit: ${name}@${targetVersion}`,
        '',
        `**Verdict:** ${verdict}`,
        `**Score:** ${score}/10`,
        `**Scanned:** ${details.publishedAt}`,
        `**Version:** ${targetVersion}`,
      ];

      if (details.permissions) {
        lines.push('', '**Permissions:**');
        const p = details.permissions;
        if (p.network?.outbound?.length) {
          lines.push(`  - Network: ${p.network.outbound.join(', ')}`);
        }
        if (p.filesystem?.read?.length || p.filesystem?.write?.length) {
          const parts: string[] = [];
          if (p.filesystem.read?.length) parts.push(`read: ${p.filesystem.read.join(', ')}`);
          if (p.filesystem.write?.length) parts.push(`write: ${p.filesystem.write.join(', ')}`);
          lines.push(`  - Filesystem: ${parts.join('; ')}`);
        }
        lines.push(`  - Subprocess: ${p.subprocess ? 'yes' : 'no'}`);
      }

      if (findingsText) {
        lines.push(findingsText);
      }

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n'),
        }],
      };
    },
  );
}

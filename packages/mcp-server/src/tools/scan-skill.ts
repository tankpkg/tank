import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import path from 'node:path';
import { TankApiClient } from '../lib/api-client.js';
import { pack } from '../lib/packer.js';
import { getConfig, setConfig } from '../lib/config.js';

interface ScanFinding {
  stage: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location: string | null;
  confidence: number | null;
  tool: string | null;
  evidence: string | null;
}

interface ScanResponse {
  scan_id: string | null;
  verdict: 'pass' | 'pass_with_notes' | 'flagged' | 'fail';
  audit_score: number;
  findings: ScanFinding[];
  stage_results: Array<{
    stage: string;
    status: string;
    findings: ScanFinding[];
    duration_ms: number;
  }>;
  duration_ms: number;
}

export function registerScanSkillTool(server: McpServer): void {
  server.tool(
    'scan-skill',
    'Scan a skill directory for security issues. Requires authentication.',
    {
      directory: z.string().optional().describe('Directory to scan (default: current directory)'),
    },
    async ({ directory = '.' }) => {
      const absDir = path.resolve(directory);
      let client = new TankApiClient();

      // Check auth, guide user to login if not authenticated
      if (!client.isAuthenticated) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'You need to log in first. Use the login tool to authenticate with Tank.\n\nExample: "Log in to Tank"',
            },
          ],
        };
      }

      // Verify auth is still valid
      const authCheck = await client.verifyAuth();
      if (!authCheck.valid) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Your session has expired. Use the login tool to authenticate again.\n\nExample: "Log in to Tank"',
            },
          ],
        };
      }

      // Pack the skill
      let packResult;
      try {
        packResult = await pack(absDir);
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to pack skill: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }

      const manifest = packResult.manifest as { name?: string; version?: string };
      const skillName = manifest.name ?? 'unknown';
      const skillVersion = manifest.version ?? '0.0.0';

      // Upload tarball and trigger scan
      const formData = new FormData();
      const blob = new Blob([packResult.tarball], { type: 'application/gzip' });
      formData.append('tarball', blob, `${skillName}-${skillVersion}.tgz`);
      formData.append('manifest', JSON.stringify(manifest));

      const config = getConfig();
      const scanRes = await fetch(`${config.registry}/api/v1/scan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${client.token}`,
        },
        body: formData,
      });

      if (!scanRes.ok) {
        const body = await scanRes.json().catch(() => ({}));
        return {
          content: [
            {
              type: 'text' as const,
              text: `Scan failed: ${(body as { error?: string }).error ?? scanRes.statusText}`,
            },
          ],
        };
      }

      const scanResult = (await scanRes.json()) as ScanResponse;

      // Format report
      const verdictEmoji: Record<string, string> = {
        pass: '✅',
        pass_with_notes: '⚠️',
        flagged: '🚩',
        fail: '❌',
      };

      const severityEmoji: Record<string, string> = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢',
      };

      const lines: string[] = [
        `## Scan Results for ${skillName}@${skillVersion}`,
        '',
        `**Verdict:** ${verdictEmoji[scanResult.verdict] ?? ''} ${scanResult.verdict.toUpperCase()}`,
        `**Score:** ${scanResult.audit_score.toFixed(1)}/10`,
        `**Duration:** ${(scanResult.duration_ms / 1000).toFixed(1)}s`,
        `**Files:** ${packResult.fileCount} (${(packResult.totalSize / 1024).toFixed(1)}KB)`,
        '',
      ];

      if (scanResult.findings.length > 0) {
        lines.push(`### Findings (${scanResult.findings.length})`);
        lines.push('');

        // Group by severity
        const bySeverity: Record<string, ScanFinding[]> = {
          critical: [],
          high: [],
          medium: [],
          low: [],
        };
        for (const f of scanResult.findings) {
          bySeverity[f.severity].push(f);
        }

        for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
          const findings = bySeverity[severity];
          if (findings.length === 0) continue;

          lines.push(`#### ${severityEmoji[severity]} ${severity.toUpperCase()} (${findings.length})`);
          for (const f of findings) {
            lines.push(`- **${f.type}**: ${f.description}`);
            if (f.location) lines.push(`  - Location: ${f.location}`);
          }
          lines.push('');
        }
      } else {
        lines.push('No findings. Your skill looks secure!');
        lines.push('');
      }

      // Stages run
      if (scanResult.stage_results?.length > 0) {
        lines.push('### Scan Stages');
        lines.push('');
        for (const stage of scanResult.stage_results) {
          const status = stage.status === 'passed' ? '✓' : '✗';
          lines.push(`- ${status} ${stage.stage} (${stage.duration_ms}ms)`);
        }
        lines.push('');
      }

      if (scanResult.scan_id) {
        lines.push(`View full report: https://tankpkg.dev/scans/${scanResult.scan_id}`);
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}

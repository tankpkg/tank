import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_MANIFEST_FILENAME, MANIFEST_FILENAME } from '@internal/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TankApiClient } from '../lib/api-client.js';
import { getConfig } from '../lib/config.js';
import { pack, packForScan } from '../lib/packer.js';

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

interface LLMAnalysis {
  enabled: boolean;
  mode: 'byollm' | 'builtin' | 'disabled';
  provider_used?: string;
  findings_reviewed?: number;
  findings_dismissed?: number;
  findings_confirmed?: number;
  findings_uncertain?: number;
  latency_ms?: number;
  error?: string;
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
  llm_analysis?: LLMAnalysis;
  duration_ms: number;
}

export function registerScanSkillTool(server: McpServer): void {
  server.tool(
    'scan-skill',
    'Scan a skill directory for security issues. Requires authentication.',
    {
      directory: z.string().optional().describe('Directory to scan (default: current directory)')
    },
    async ({ directory = '.' }) => {
      const absDir = path.resolve(directory);
      const client = new TankApiClient();

      // Check auth, guide user to login if not authenticated
      if (!client.isAuthenticated) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'You need to log in first. Use the login tool to authenticate with Tank.\n\nExample: "Log in to Tank"'
            }
          ]
        };
      }

      // Verify auth is still valid
      const authCheck = await client.verifyAuth();
      if (!authCheck.valid) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Your session has expired. Use the login tool to authenticate again.\n\nExample: "Log in to Tank"'
            }
          ]
        };
      }

      let packResult: Awaited<ReturnType<typeof pack>>;
      let usedSynthesisedManifest = false;

      const hasManifest =
        fs.existsSync(path.join(absDir, MANIFEST_FILENAME)) ||
        fs.existsSync(path.join(absDir, LEGACY_MANIFEST_FILENAME));

      if (hasManifest) {
        try {
          packResult = await pack(absDir);
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to pack skill: ${err instanceof Error ? err.message : String(err)}`
              }
            ]
          };
        }
      } else {
        try {
          packResult = await packForScan(absDir);
          usedSynthesisedManifest = true;
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to pack directory for scan: ${err instanceof Error ? err.message : String(err)}`
              }
            ]
          };
        }
      }

      const manifest = packResult.manifest as { name?: string; version?: string };
      const skillName = manifest.name ?? 'unknown';
      const skillVersion = manifest.version ?? '0.0.0';

      // Upload tarball and trigger scan
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(packResult.tarball)], { type: 'application/gzip' });
      formData.append('tarball', blob, `${skillName}-${skillVersion}.tgz`);
      formData.append('manifest', JSON.stringify(manifest));

      const config = getConfig();
      const scanRes = await fetch(`${config.registry}/api/v1/scan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${client.token}`
        },
        body: formData
      });

      if (!scanRes.ok) {
        const body = await scanRes.json().catch(() => ({}));
        return {
          content: [
            {
              type: 'text' as const,
              text: `Scan failed: ${(body as { error?: string }).error ?? scanRes.statusText}`
            }
          ]
        };
      }

      const scanResult = (await scanRes.json()) as ScanResponse;

      // Format report
      const verdictEmoji: Record<string, string> = {
        pass: '✅',
        pass_with_notes: '⚠️',
        flagged: '🚩',
        fail: '❌'
      };

      const severityEmoji: Record<string, string> = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢'
      };

      const lines: string[] = [`## Scan Results for ${skillName}@${skillVersion}`, ''];

      if (usedSynthesisedManifest) {
        lines.push(`> **Note:** No \`${MANIFEST_FILENAME}\` found. A synthesised manifest was used for scanning.`);
        lines.push('');
      }

      const auditScore = scanResult.audit_score ?? 0;
      const durationMs = scanResult.duration_ms ?? 0;

      lines.push(
        `**Verdict:** ${verdictEmoji[scanResult.verdict] ?? ''} ${scanResult.verdict.toUpperCase()}`,
        `**Score:** ${auditScore.toFixed(1)}/10`,
        `**Duration:** ${(durationMs / 1000).toFixed(1)}s`,
        `**Files:** ${packResult.fileCount} (${(packResult.totalSize / 1024).toFixed(1)}KB)`,
        ''
      );

      if (scanResult.findings.length > 0) {
        lines.push(`### Findings (${scanResult.findings.length})`);
        lines.push('');

        // Group by severity
        const bySeverity: Record<string, ScanFinding[]> = {
          critical: [],
          high: [],
          medium: [],
          low: []
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

      // LLM Analysis
      if (scanResult.llm_analysis?.enabled) {
        const llm = scanResult.llm_analysis;
        lines.push('### LLM Analysis');
        lines.push('');
        lines.push(`**Mode:** ${llm.mode}`);
        if (llm.provider_used) {
          lines.push(`**Provider:** ${llm.provider_used}`);
        }
        if (llm.findings_reviewed !== undefined && llm.findings_reviewed > 0) {
          lines.push(`**Findings Reviewed:** ${llm.findings_reviewed}`);
        }
        if (llm.findings_dismissed !== undefined && llm.findings_dismissed > 0) {
          lines.push(`**False Positives Dismissed:** ${llm.findings_dismissed}`);
        }
        if (llm.findings_confirmed !== undefined && llm.findings_confirmed > 0) {
          lines.push(`**Threats Confirmed:** ${llm.findings_confirmed}`);
        }
        if (llm.findings_uncertain !== undefined && llm.findings_uncertain > 0) {
          lines.push(`**Uncertain:** ${llm.findings_uncertain}`);
        }
        if (llm.latency_ms) {
          lines.push(`**Latency:** ${llm.latency_ms}ms`);
        }
        if (llm.error) {
          lines.push(`**Error:** ${llm.error}`);
        }
        lines.push('');
      }

      if (scanResult.scan_id) {
        lines.push(`View full report: https://tankpkg.dev/scans/${scanResult.scan_id}`);
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }]
      };
    }
  );
}

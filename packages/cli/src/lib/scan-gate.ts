/**
 * Security scan gate for `tank install <url>`.
 * Calls the public scan API and enforces verdicts.
 */

import { createInterface } from 'node:readline';

import chalk from 'chalk';

import { getConfig } from '~/lib/config.js';
import { USER_AGENT } from '~/version.js';

export interface ScanFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  description: string;
  location?: string;
}

export interface ScanResult {
  success: boolean;
  verdict: 'pass' | 'pass_with_notes' | 'flagged' | 'fail' | 'error';
  auditScore: number | null;
  findings: ScanFinding[];
  durationMs: number | null;
  error?: string;
}

export interface EnforceResult {
  allowed: boolean;
  reason?: string;
}

interface ScanApiResponse {
  verdict: 'pass' | 'pass_with_notes' | 'flagged' | 'fail';
  audit_score: number;
  findings: Array<{
    severity: string;
    type: string;
    description: string;
    location: string | null;
  }>;
  stage_results: Array<{
    stage: string;
    status: string;
    findings: unknown[];
    duration_ms: number;
  }>;
  duration_ms: number;
}

function verdictColor(verdict: string): (text: string) => string {
  switch (verdict) {
    case 'pass':
      return chalk.green;
    case 'pass_with_notes':
      return chalk.yellow;
    case 'flagged':
      return chalk.hex('#FF8C00');
    case 'fail':
      return chalk.red;
    case 'error':
      return chalk.red;
    default:
      return chalk.white;
  }
}

function severityColor(severity: string): (text: string) => string {
  switch (severity) {
    case 'critical':
      return chalk.red;
    case 'high':
      return chalk.hex('#FF8C00');
    case 'medium':
      return chalk.yellow;
    case 'low':
      return chalk.green;
    case 'info':
      return chalk.blue;
    default:
      return chalk.white;
  }
}

function scoreColor(score: number): (text: string) => string {
  if (score >= 7) return chalk.green;
  if (score >= 4) return chalk.yellow;
  return chalk.red;
}

async function promptUser(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function scanUrl(url: string, options?: { token?: string; registryUrl?: string }): Promise<ScanResult> {
  const config = getConfig();
  const registryUrl = options?.registryUrl ?? config.registry;
  const token = options?.token ?? config.token;

  let res: Response;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    res = await fetch(`${registryUrl}/api/v1/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(65_000)
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      verdict: 'error',
      auditScore: null,
      findings: [],
      durationMs: null,
      error: `Network error: ${msg}`
    };
  }

  if (!res.ok) {
    if (res.status === 429) {
      const hint = token
        ? 'Authenticated rate limit reached (20/hr). Try again later.'
        : 'Anonymous rate limit reached (3/hr). Run `tank login` for higher limits.';
      return {
        success: false,
        verdict: 'error',
        auditScore: null,
        findings: [],
        durationMs: null,
        error: `Rate limited (429): ${hint}`
      };
    }

    if (res.status === 504) {
      return {
        success: false,
        verdict: 'error',
        auditScore: null,
        findings: [],
        durationMs: null,
        error: 'Scan timed out (504). The skill may be too large or the scanner is overloaded.'
      };
    }

    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return {
      success: false,
      verdict: 'error',
      auditScore: null,
      findings: [],
      durationMs: null,
      error: body?.error ?? `HTTP ${res.status}: ${res.statusText}`
    };
  }

  const data = (await res.json()) as ScanApiResponse;

  const findings: ScanFinding[] = data.findings.map((f) => ({
    severity: f.severity as ScanFinding['severity'],
    type: f.type,
    description: f.description,
    ...(f.location ? { location: f.location } : {})
  }));

  return {
    success: true,
    verdict: data.verdict,
    auditScore: data.audit_score ?? null,
    findings,
    durationMs: data.duration_ms ?? null
  };
}

export function displayScanResults(result: ScanResult): void {
  const verdictLabel = verdictColor(result.verdict)(result.verdict.toUpperCase());

  console.log('');
  console.log(chalk.bold('Security Scan Results'));
  console.log('');
  console.log(`${chalk.dim('Verdict:'.padEnd(14))}${verdictLabel}`);

  if (result.auditScore !== null) {
    const scoreLabel = scoreColor(result.auditScore)(result.auditScore.toFixed(1));
    console.log(`${chalk.dim('Score:'.padEnd(14))}${scoreLabel}/10`);
  }

  if (result.durationMs !== null) {
    console.log(`${chalk.dim('Duration:'.padEnd(14))}${(result.durationMs / 1000).toFixed(1)}s`);
  }

  if (result.error) {
    console.log(`${chalk.dim('Error:'.padEnd(14))}${chalk.red(result.error)}`);
  }

  if (result.findings.length > 0) {
    console.log('');
    console.log(chalk.bold(`Findings (${result.findings.length})`));

    const bySeverity: Record<string, ScanFinding[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: []
    };
    for (const f of result.findings) {
      bySeverity[f.severity].push(f);
    }

    for (const severity of ['critical', 'high', 'medium', 'low', 'info'] as const) {
      const group = bySeverity[severity];
      if (group.length === 0) continue;

      console.log('');
      const label = severityColor(severity)(`${severity.toUpperCase()} (${group.length})`);
      console.log(`  ${label}`);

      for (const f of group) {
        console.log(`    - ${chalk.bold(f.type)}: ${f.description}`);
        if (f.location) {
          console.log(`      ${chalk.dim('Location:')} ${f.location}`);
        }
      }
    }
  } else if (result.success) {
    console.log('');
    console.log(chalk.green('No findings. The skill looks secure.'));
  }

  console.log('');
}

export async function enforceVerdict(result: ScanResult, options?: { yes?: boolean }): Promise<EnforceResult> {
  switch (result.verdict) {
    case 'pass':
    case 'pass_with_notes':
      return { allowed: true };

    case 'flagged': {
      if (options?.yes) {
        return { allowed: true };
      }

      const count = result.findings.length;
      const accepted = await promptUser(
        chalk.yellow(`⚠ Security scan flagged ${count} issue${count === 1 ? '' : 's'}. Install anyway? (y/N) `)
      );

      if (accepted) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'User declined after security warnings' };
    }

    case 'fail':
      return { allowed: false, reason: 'Security scan failed with critical findings' };

    case 'error':
      return { allowed: false, reason: `Security scan error: ${result.error ?? 'unknown'}` };

    default:
      return { allowed: false, reason: `Unknown verdict: ${result.verdict}` };
  }
}

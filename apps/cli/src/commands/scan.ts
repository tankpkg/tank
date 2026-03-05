import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import { getConfig } from '../lib/config.js';
import { pack, packForScan } from '../lib/packer.js';
import { USER_AGENT } from '../version.js';

export interface ScanOptions {
  directory?: string;
  configDir?: string;
}

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

function verdictColor(verdict: string): (text: string) => string {
  switch (verdict) {
    case 'pass': return chalk.green;
    case 'pass_with_notes': return chalk.yellow;
    case 'flagged': return chalk.hex('#FF8C00');
    case 'fail': return chalk.red;
    default: return chalk.white;
  }
}

function severityColor(severity: string): (text: string) => string {
  switch (severity) {
    case 'critical': return chalk.red;
    case 'high': return chalk.hex('#FF8C00');
    case 'medium': return chalk.yellow;
    case 'low': return chalk.green;
    default: return chalk.white;
  }
}

function scoreColor(score: number): (text: string) => string {
  if (score >= 7) return chalk.green;
  if (score >= 4) return chalk.yellow;
  return chalk.red;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function scanCommand(options: ScanOptions = {}): Promise<void> {
  const { directory = process.cwd(), configDir } = options;
  const absDir = path.resolve(directory);

  const config = getConfig(configDir);
  if (!config.token) {
    throw new Error('Not logged in. Run: tank login');
  }

  const spinner = ora('Packing skill...').start();
  
  // Try to read skills.json first
  const skillsJsonPath = path.join(absDir, 'skills.json');
  let manifest: Record<string, unknown>;
  let packResult: Awaited<ReturnType<typeof pack>>;
  
  const skillsJsonExists = fs.existsSync(skillsJsonPath);
  
  if (skillsJsonExists) {
    // skills.json exists: use pack() and read the manifest
    try {
      packResult = await pack(absDir);
    } catch (err) {
      spinner.fail('Packing failed');
      throw err;
    }
    
    try {
      manifest = JSON.parse(fs.readFileSync(skillsJsonPath, 'utf-8')) as Record<string, unknown>;
    } catch (err) {
      spinner.fail('Failed to read skills.json');
      throw err;
    }
  } else {
    // skills.json does NOT exist: use packForScan() and synthesize manifest
    try {
      packResult = await packForScan(absDir);
    } catch (err) {
      spinner.fail('Packing failed');
      throw err;
    }
    
    const dirName = path.basename(absDir);
    manifest = { name: dirName, version: '0.0.0', description: 'Local scan' };
  }

  const name = (manifest.name as string) ?? 'unknown';
  const version = (manifest.version as string) ?? '0.0.0';

  spinner.text = `Scanning ${name}@${version}...`;

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(packResult.tarball)], { type: 'application/gzip' });
  formData.append('tarball', blob, `${name}-${version}.tgz`);
  formData.append('manifest', JSON.stringify(manifest));

  let scanRes: Response;
  try {
    scanRes = await fetch(`${config.registry}/api/v1/scan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'User-Agent': USER_AGENT,
      },
      body: formData,
    });
  } catch (err) {
    spinner.fail('Scan failed');
    throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!scanRes.ok) {
    spinner.fail('Scan failed');
    const body = await scanRes.json().catch(() => ({})) as { error?: string };

    if (scanRes.status === 401) {
      throw new Error('Authentication failed. Your token may be expired or invalid. Run: tank login');
    }
    throw new Error(body.error ?? scanRes.statusText);
  }

  const result = await scanRes.json() as ScanResponse;

  spinner.stop();

  const verdictLabel = verdictColor(result.verdict)(result.verdict.toUpperCase());
  const auditScore = result.audit_score ?? 0;
  const scoreLabel = scoreColor(auditScore)(auditScore.toFixed(1));

  console.log('');
  console.log(chalk.bold(`Security Scan: ${name}@${version}`));
  console.log('');
  console.log(`${chalk.dim('Verdict:'.padEnd(14))}${verdictLabel}`);
  console.log(`${chalk.dim('Score:'.padEnd(14))}${scoreLabel}/10`);
  console.log(`${chalk.dim('Duration:'.padEnd(14))}${(result.duration_ms / 1000).toFixed(1)}s`);
  console.log(`${chalk.dim('Files:'.padEnd(14))}${packResult.fileCount} (${formatSize(packResult.totalSize)})`);

  if (result.findings.length > 0) {
    console.log('');
    console.log(chalk.bold(`Findings (${result.findings.length})`));

    const bySeverity: Record<string, ScanFinding[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };
    for (const f of result.findings) {
      bySeverity[f.severity].push(f);
    }

    for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
      const findings = bySeverity[severity];
      if (findings.length === 0) continue;

      console.log('');
      const label = severityColor(severity)(`${severity.toUpperCase()} (${findings.length})`);
      console.log(`  ${label}`);

      for (const f of findings) {
        console.log(`    - ${chalk.bold(f.type)}: ${f.description}`);
        if (f.location) {
          console.log(`      ${chalk.dim('Location:')} ${f.location}`);
        }
      }
    }
  } else {
    console.log('');
    console.log(chalk.green('No findings. Your skill looks secure!'));
  }

  if (result.stage_results?.length > 0) {
    console.log('');
    console.log(chalk.bold('Scan Stages'));
    for (const stage of result.stage_results) {
      const icon = stage.status === 'passed' ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${icon} ${stage.stage} (${stage.duration_ms}ms)`);
    }
  }

  if (result.scan_id) {
    console.log('');
    console.log(chalk.dim(`Full report: ${config.registry}/scans/${result.scan_id}`));
  }

  console.log('');
}

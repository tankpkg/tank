import chalk from 'chalk';
import { getConfig } from '../lib/config.js';
import { readLockfile } from '../lib/lockfile.js';

export interface AuditOptions {
  name?: string;
  configDir?: string;
}

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

interface AuditResult {
  name: string;
  version: string;
  score: number | null;
  status: string;
  permissions?: VersionDetails['permissions'];
  error?: boolean;
}

function scoreColor(score: number): (text: string) => string {
  if (score >= 7) return chalk.green;
  if (score >= 4) return chalk.yellow;
  return chalk.red;
}

function formatScore(result: AuditResult): string {
  if (result.error) return chalk.dim('error');
  if (result.score == null || result.status !== 'completed') {
    return chalk.dim('pending');
  }
  return scoreColor(result.score)(result.score.toFixed(1));
}

function formatStatus(result: AuditResult): string {
  if (result.error) return chalk.dim('error');
  if (result.score == null || result.status !== 'completed') {
    return chalk.dim('Analysis pending');
  }
  if (result.score >= 4) return chalk.green('pass');
  return chalk.red('issues');
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return text;
  return text + ' '.repeat(width - text.length);
}

/**
 * Parse a lockfile key like "@org/skill@1.0.0" into { name, version }.
 * Scoped packages start with @, so find the LAST @ to split.
 */
function parseLockKey(key: string): { name: string; version: string } {
  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0) {
    throw new Error(`Invalid lockfile key: ${key}`);
  }
  return {
    name: key.slice(0, lastAt),
    version: key.slice(lastAt + 1),
  };
}

async function fetchVersionDetails(
  registryUrl: string,
  name: string,
  version: string,
): Promise<VersionDetails> {
  const encodedName = encodeURIComponent(name);
  const url = `${registryUrl}/api/v1/skills/${encodedName}/${version}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'tank-cli/0.1.0' },
    });
  } catch (err) {
    throw new Error(`Network error fetching audit data: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    throw new Error(`API error for ${name}@${version}: ${res.status} ${res.statusText}`);
  }

  return await res.json() as VersionDetails;
}

function displayDetailedAudit(result: AuditResult): void {
  console.log('');
  console.log(chalk.bold(result.name));
  console.log('');
  console.log(`${chalk.dim('Version:'.padEnd(14))}${result.version}`);
  console.log(`${chalk.dim('Audit Score:'.padEnd(14))}${formatScore(result)}`);
  console.log(`${chalk.dim('Status:'.padEnd(14))}${result.status}`);

  const perms = result.permissions;
  if (perms) {
    console.log('');
    console.log(chalk.bold('Permissions:'));

    const networkDomains = perms.network?.outbound;
    if (networkDomains && networkDomains.length > 0) {
      console.log(`  ${chalk.dim('Network:'.padEnd(14))}${networkDomains.join(', ')}`);
    }

    const fsRead = perms.filesystem?.read;
    const fsWrite = perms.filesystem?.write;
    if (fsRead || fsWrite) {
      const parts: string[] = [];
      if (fsRead && fsRead.length > 0) {
        parts.push(`${fsRead.join(', ')} (read)`);
      }
      if (fsWrite && fsWrite.length > 0) {
        parts.push(`${fsWrite.join(', ')} (write)`);
      }
      console.log(`  ${chalk.dim('Filesystem:'.padEnd(14))}${parts.join(', ')}`);
    }

    console.log(`  ${chalk.dim('Subprocess:'.padEnd(14))}${perms.subprocess ? 'yes' : 'no'}`);
  }
}

function displayTable(results: AuditResult[]): void {
  // Header
  console.log(
    padRight('NAME', 30) +
    padRight('VERSION', 12) +
    padRight('SCORE', 10) +
    'STATUS',
  );

  for (const result of results) {
    const name = chalk.bold(padRight(result.name, 30));
    const version = padRight(result.version, 12);
    const score = padRight(formatScore(result), 10);
    const status = formatStatus(result);

    console.log(`${name}${version}${score}${status}`);
  }

  // Summary
  const total = results.length;
  const pass = results.filter(
    (r) => !r.error && r.score != null && r.status === 'completed' && r.score >= 4,
  ).length;
  const issues = total - pass;

  console.log('');
  console.log(
    `${total} skill${total === 1 ? '' : 's'} audited. ` +
    `${pass} pass, ${issues} ${issues === 1 ? 'has' : 'have'} issues.`,
  );
}

export async function auditCommand(options: AuditOptions): Promise<void> {
  const { name, configDir } = options;
  const config = getConfig(configDir);

  // Read lockfile
  const lock = readLockfile();

  if (!lock) {
    console.log('No lockfile found. Run: tank install');
    return;
  }

  const entries = Object.entries(lock.skills);

  if (entries.length === 0) {
    console.log('No skills installed.');
    return;
  }

  // Single skill audit
  if (name) {
    // Find the skill in lockfile
    const matchingEntry = entries.find(([key]) => {
      const parsed = parseLockKey(key);
      return parsed.name === name;
    });

    if (!matchingEntry) {
      console.log(`Skill not installed: ${name}`);
      return;
    }

    const [key] = matchingEntry;
    const parsed = parseLockKey(key);

    const details = await fetchVersionDetails(config.registry, parsed.name, parsed.version);

    const result: AuditResult = {
      name: parsed.name,
      version: parsed.version,
      score: details.auditScore,
      status: details.auditStatus,
      permissions: details.permissions,
    };

    displayDetailedAudit(result);
    return;
  }

  // Audit all skills
  const results: AuditResult[] = [];

  for (const [key] of entries) {
    const parsed = parseLockKey(key);

    try {
      const details = await fetchVersionDetails(config.registry, parsed.name, parsed.version);

      results.push({
        name: parsed.name,
        version: parsed.version,
        score: details.auditScore,
        status: details.auditStatus,
      });
    } catch (err) {
      // For network errors, re-throw immediately
      if (err instanceof Error && err.message.startsWith('Network error')) {
        throw err;
      }

      // For API errors (404, etc.), show the skill with error status
      results.push({
        name: parsed.name,
        version: parsed.version,
        score: null,
        status: 'error',
        error: true,
      });
    }
  }

  displayTable(results);
}

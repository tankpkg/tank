import chalk from 'chalk';
import { getConfig } from '../lib/config.js';

export interface InfoOptions {
  name: string;
  configDir?: string;
}

interface SkillMetadata {
  name: string;
  description?: string;
  latestVersion: string;
  publisher: { displayName: string };
  createdAt: string;
  updatedAt?: string;
}

interface VersionDetails {
  name: string;
  version: string;
  permissions?: {
    network?: { outbound?: string[] };
    filesystem?: { read?: string[]; write?: string[] };
    subprocess?: boolean;
  };
  auditScore?: number;
  auditStatus?: string;
  downloadUrl: string;
  publishedAt: string;
}

function formatDate(iso: string): string {
  try {
    return iso.split('T')[0];
  } catch {
    return iso;
  }
}

function labelValue(label: string, value: string): string {
  return `${chalk.dim(label.padEnd(14))}${value}`;
}

export async function infoCommand(options: InfoOptions): Promise<void> {
  const { name, configDir } = options;
  const config = getConfig(configDir);

  const encodedName = encodeURIComponent(name);
  const metaUrl = `${config.registry}/api/v1/skills/${encodedName}`;

  // 1. Fetch skill metadata
  let metaRes: Response;
  try {
    metaRes = await fetch(metaUrl, {
      headers: { 'User-Agent': 'tank-cli/0.1.0' },
    });
  } catch (err) {
    throw new Error(`Network error fetching skill info: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (metaRes.status === 404) {
    console.log(`Skill not found: ${name}`);
    return;
  }

  if (!metaRes.ok) {
    const body = await metaRes.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Failed to fetch skill info: ${metaRes.statusText}`);
  }

  const meta = await metaRes.json() as SkillMetadata;

  // 2. Fetch version details for permissions
  const versionUrl = `${config.registry}/api/v1/skills/${encodedName}/${meta.latestVersion}`;

  let versionRes: Response;
  try {
    versionRes = await fetch(versionUrl, {
      headers: { 'User-Agent': 'tank-cli/0.1.0' },
    });
  } catch (err) {
    throw new Error(`Network error fetching version details: ${err instanceof Error ? err.message : String(err)}`);
  }

  let versionData: VersionDetails | undefined;
  if (versionRes.ok) {
    versionData = await versionRes.json() as VersionDetails;
  }

  // 3. Display info
  console.log('');
  console.log(chalk.bold(meta.name));
  console.log('');

  if (meta.description) {
    console.log(labelValue('Description:', meta.description));
  }

  console.log(labelValue('Version:', meta.latestVersion));
  console.log(labelValue('Publisher:', meta.publisher?.displayName ?? 'unknown'));

  if (versionData?.auditScore != null) {
    console.log(labelValue('Audit Score:', `${versionData.auditScore}/10`));
  }

  console.log(labelValue('Created:', formatDate(meta.createdAt)));

  // 4. Display permissions
  const perms = versionData?.permissions;
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

    const subprocess = perms.subprocess;
    console.log(`  ${chalk.dim('Subprocess:'.padEnd(14))}${subprocess ? 'yes' : 'no'}`);
  }

  // 5. Install hint
  console.log('');
  console.log(`Install: ${chalk.cyan(`tank install ${meta.name}`)}`);
}

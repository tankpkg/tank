import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import { getConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { pack } from '../lib/packer.js';

export interface PublishOptions {
  directory?: string;
  configDir?: string;
  dryRun?: boolean;
}

/**
 * Format bytes into a human-readable size string.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Publish a skill package to the Tank registry.
 *
 * Flow:
 * 1. Check auth (token exists)
 * 2. Read skills.json from directory
 * 3. Pack directory into tarball
 * 4. If --dry-run: print summary and exit
 * 5. POST /api/v1/skills with manifest → get uploadUrl, skillId, versionId
 * 6. PUT tarball to uploadUrl
 * 7. POST /api/v1/skills/confirm with integrity data
 * 8. Print success
 */
export async function publishCommand(options: PublishOptions = {}): Promise<void> {
  const { directory = process.cwd(), configDir, dryRun = false } = options;

  // 1. Check auth
  const config = getConfig(configDir);
  if (!config.token) {
    throw new Error('Not logged in. Run: tank login');
  }

  // 2. Read skills.json
  const skillsJsonPath = path.join(directory, 'skills.json');
  if (!fs.existsSync(skillsJsonPath)) {
    throw new Error(
      `No skills.json found in ${directory}. Run: tank init`,
    );
  }

  let manifest: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(skillsJsonPath, 'utf-8');
    manifest = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to read or parse skills.json');
  }

  const name = manifest.name as string;
  const version = manifest.version as string;

  // 3. Pack
  const spinner = ora('Packing...').start();
  let packResult: Awaited<ReturnType<typeof pack>>;
  try {
    packResult = await pack(directory);
  } catch (err) {
    spinner.fail('Packing failed');
    throw err;
  }

  const { tarball, integrity, fileCount, totalSize, readme, files } = packResult;

  // 4. Dry run — print summary and exit
  if (dryRun) {
    spinner.stop();
    logger.info(`name:    ${name}`);
    logger.info(`version: ${version}`);
    logger.info(`size:    ${formatSize(totalSize)} (${fileCount} files)`);
    logger.info(`tarball: ${formatSize(tarball.length)} (compressed)`);
    logger.success('Dry run complete — no files were uploaded.');
    return;
  }

  // 5. Step 1: POST /api/v1/skills
  spinner.text = 'Publishing...';
  const headers = {
    'Authorization': `Bearer ${config.token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'tank-cli/0.1.0',
  };

  const step1Res = await fetch(`${config.registry}/api/v1/skills`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ manifest, readme, files }),
  });

  if (!step1Res.ok) {
    spinner.fail('Publish failed');
    const body = await step1Res.json().catch(() => ({})) as { error?: string };
    const errorMsg = body.error ?? step1Res.statusText;

    if (step1Res.status === 401) {
      throw new Error('Authentication failed. Run: tank login');
    }
    if (step1Res.status === 403) {
      throw new Error(
        "You don't have permission to publish to this organization",
      );
    }
    if (step1Res.status === 409) {
      throw new Error(
        'Version already exists. Bump the version in skills.json',
      );
    }
    throw new Error(errorMsg);
  }

  const { uploadUrl, versionId } = (await step1Res.json()) as {
    uploadUrl: string;
    skillId: string;
    versionId: string;
  };

  // 6. Step 2: Upload tarball to signed URL
  spinner.text = 'Uploading...';
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(tarball),
  });

  if (!uploadRes.ok) {
    spinner.fail('Upload failed');
    throw new Error(
      `Failed to upload tarball: ${uploadRes.status} ${uploadRes.statusText}`,
    );
  }

  // 7. Step 3: Confirm publish
  spinner.text = 'Confirming...';
  const confirmRes = await fetch(`${config.registry}/api/v1/skills/confirm`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      versionId,
      integrity,
      fileCount,
      tarballSize: totalSize,
      readme,
    }),
  });

  if (!confirmRes.ok) {
    spinner.fail('Publish confirmation failed');
    const body = await confirmRes.json().catch(() => ({})) as { error?: string };
    throw new Error(
      `Failed to confirm publish: ${body.error ?? confirmRes.statusText}`,
    );
  }

  spinner.succeed(`Published ${name}@${version} (${formatSize(totalSize)}, ${fileCount} files)`);
}

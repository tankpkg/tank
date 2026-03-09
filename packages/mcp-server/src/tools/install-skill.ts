import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LOCKFILE_VERSION, type Permissions, resolve, type SkillsLock } from '@internal/shared';
import { extract } from 'tar';
import { z } from 'zod';
import { TankApiClient } from '../lib/api-client.js';

const SCOPED_NAME_PATTERN = /^@[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;

interface VersionInfo {
  version: string;
  integrity: string;
  auditScore: number;
  auditStatus: string;
  publishedAt: string;
}

interface VersionMetadata {
  name: string;
  version: string;
  description?: string;
  integrity: string;
  permissions: Permissions;
  auditScore: number;
  auditStatus: string;
  downloadUrl: string;
  publishedAt: string;
}

function textResult(text: string, isError?: boolean) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(isError ? { isError: true } : {})
  };
}

function getSkillDir(projectDir: string, skillName: string): string {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(projectDir, '.tank', 'skills', scope, name);
  }
  return path.join(projectDir, '.tank', 'skills', skillName);
}

export function registerInstallSkillTool(server: McpServer): void {
  server.tool(
    'install-skill',
    'Install a skill from the Tank registry. Resolves version, downloads tarball, verifies SHA-512 integrity, extracts files, and updates skills.json + skills.lock.',
    {
      name: z.string().describe('Skill name in @org/name format'),
      version: z.string().optional().describe('Specific version or semver range (default: latest)'),
      directory: z.string().optional().describe('Project directory (defaults to current working directory)')
    },
    async ({ name, version: versionRange, directory }) => {
      // 1. Validate scoped name
      if (!SCOPED_NAME_PATTERN.test(name)) {
        return textResult(
          `Validation error: Skill name "${name}" must use the @org/name format (e.g. @acme/my-skill).`,
          true
        );
      }

      const client = new TankApiClient();

      // 2. Check authentication
      if (!client.isAuthenticated) {
        return textResult('Not authenticated. Use the "login" tool first to authenticate with Tank.', true);
      }

      const dir = directory ? path.resolve(directory) : process.cwd();
      const range = versionRange ?? '*';

      // 3. Read or create skills.json
      const skillsJsonPath = path.join(dir, 'skills.json');
      let skillsJson: Record<string, unknown> = { skills: {} };
      if (fs.existsSync(skillsJsonPath)) {
        try {
          const raw = fs.readFileSync(skillsJsonPath, 'utf-8');
          skillsJson = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return textResult('Failed to read or parse skills.json.', true);
        }
      } else {
        skillsJson = { skills: {} };
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(skillsJsonPath, `${JSON.stringify(skillsJson, null, 2)}\n`);
      }

      // 4. Read existing lockfile
      const lockPath = path.join(dir, 'skills.lock');
      let lock: SkillsLock = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
      if (fs.existsSync(lockPath)) {
        try {
          const raw = fs.readFileSync(lockPath, 'utf-8');
          lock = JSON.parse(raw) as SkillsLock;
        } catch {
          lock = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
        }
      }

      // 5. Fetch available versions
      const encodedName = encodeURIComponent(name);
      const versionsResult = await client.fetch<{ name: string; versions: VersionInfo[] }>(
        `/api/v1/skills/${encodedName}/versions`
      );

      if (!versionsResult.ok) {
        if (versionsResult.status === 401 || versionsResult.status === 403) {
          return textResult('Authentication failed. Use the "login" tool to authenticate with Tank.', true);
        }
        if (versionsResult.status === 404) {
          return textResult(`Skill not found: "${name}" does not exist in the Tank registry.`, true);
        }
        if (versionsResult.status === 0) {
          return textResult(
            `Cannot reach the Tank registry. Check your network connection and try again.\nError: ${versionsResult.error}`,
            true
          );
        }
        return textResult(`Failed to fetch versions for ${name}: ${versionsResult.error}`, true);
      }

      const availableVersions = versionsResult.data.versions.map((v) => v.version);

      // 6. Resolve best version
      const resolved = resolve(range, availableVersions);
      if (!resolved) {
        return textResult(
          `No version of ${name} satisfies range "${range}". Available versions: ${availableVersions.join(', ')}`,
          true
        );
      }

      // 7. Check if already installed
      const lockKey = `${name}@${resolved}`;
      if (lock.skills[lockKey]) {
        return textResult(`${name}@${resolved} is already installed. No changes needed.`);
      }

      // 8. Fetch version metadata
      const metaResult = await client.fetch<VersionMetadata>(`/api/v1/skills/${encodedName}/${resolved}`);

      if (!metaResult.ok) {
        if (metaResult.status === 404) {
          return textResult(`Version ${resolved} of ${name} not found in the registry.`, true);
        }
        return textResult(`Failed to fetch metadata for ${name}@${resolved}: ${metaResult.error}`, true);
      }

      const metadata = metaResult.data;

      // 9. Download tarball
      let tarballBuffer: Buffer;
      try {
        const downloadRes = await fetch(metadata.downloadUrl);
        if (!downloadRes.ok) {
          return textResult(
            `Failed to download tarball for ${name}@${resolved}: ${downloadRes.status} ${downloadRes.statusText}`,
            true
          );
        }
        tarballBuffer = Buffer.from(await downloadRes.arrayBuffer());
      } catch (err) {
        return textResult(
          `Network error downloading tarball for ${name}@${resolved}: ${err instanceof Error ? err.message : String(err)}`,
          true
        );
      }

      // 10. Verify SHA-512 integrity
      const hash = crypto.createHash('sha512').update(tarballBuffer).digest('base64');
      const computedIntegrity = `sha512-${hash}`;

      if (computedIntegrity !== metadata.integrity) {
        return textResult(
          `Integrity verification failed for ${name}@${resolved}.\n` +
            `Expected: ${metadata.integrity}\n` +
            `Got: ${computedIntegrity}\n\n` +
            'The tarball may have been tampered with. No files were extracted.',
          true
        );
      }

      // 11. Extract tarball safely
      const extractDir = getSkillDir(dir, name);
      fs.mkdirSync(extractDir, { recursive: true });

      try {
        await extractSafely(tarballBuffer, extractDir);
      } catch (err) {
        // Clean up on extraction failure
        fs.rmSync(extractDir, { recursive: true, force: true });
        return textResult(
          `Failed to extract tarball for ${name}@${resolved}: ${err instanceof Error ? err.message : String(err)}`,
          true
        );
      }

      // 12. Update skills.json
      const skills = (skillsJson.skills ?? {}) as Record<string, string>;
      skills[name] = range === '*' ? `^${resolved}` : range;
      skillsJson.skills = skills;
      fs.writeFileSync(skillsJsonPath, `${JSON.stringify(skillsJson, null, 2)}\n`);

      // 13. Update skills.lock
      lock.skills[lockKey] = {
        resolved: metadata.downloadUrl,
        integrity: computedIntegrity,
        permissions: metadata.permissions ?? {},
        audit_score: metadata.auditScore ?? null
      };

      // Sort keys alphabetically for determinism
      const sortedSkills: Record<string, unknown> = {};
      for (const key of Object.keys(lock.skills).sort()) {
        sortedSkills[key] = lock.skills[key];
      }
      lock.skills = sortedSkills as SkillsLock['skills'];

      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

      // Build response
      const score =
        metadata.auditScore !== null && metadata.auditScore !== undefined
          ? `${metadata.auditScore.toFixed(1)}/10`
          : 'pending';

      const lines: string[] = [
        `## Installed ${name}@${resolved}`,
        '',
        `**Integrity:** SHA-512 verified`,
        `**Audit Score:** ${score}`,
        `**Extracted to:** ${extractDir}`,
        '',
        '### Updated files',
        `- skills.json: added "${name}": "${skills[name]}"`,
        `- skills.lock: added ${lockKey}`
      ];

      return textResult(lines.join('\n'));
    }
  );
}

/**
 * Extract a tarball safely with security checks.
 * Rejects: absolute paths, path traversal (..), symlinks/hardlinks.
 */
async function extractSafely(tarball: Buffer, destDir: string): Promise<void> {
  const tmpTarball = path.join(destDir, '.tmp-tarball.tgz');
  fs.writeFileSync(tmpTarball, tarball);

  try {
    await extract({
      file: tmpTarball,
      cwd: destDir,
      filter: (entryPath: string) => {
        if (path.isAbsolute(entryPath)) {
          throw new Error(`Absolute path in tarball: ${entryPath}`);
        }
        if (entryPath.split('/').includes('..') || entryPath.split(path.sep).includes('..')) {
          throw new Error(`Path traversal in tarball: ${entryPath}`);
        }
        return true;
      },
      onReadEntry: (entry) => {
        if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
          throw new Error(`Symlink/hardlink in tarball: ${entry.path}`);
        }
      }
    });
  } finally {
    if (fs.existsSync(tmpTarball)) {
      fs.unlinkSync(tmpTarball);
    }
  }
}

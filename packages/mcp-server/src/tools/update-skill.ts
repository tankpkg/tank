import fs from 'node:fs';
import path from 'node:path';

import { resolve } from '@internals/helpers';
import {
  LEGACY_LOCKFILE_FILENAME,
  LEGACY_MANIFEST_FILENAME,
  LOCKFILE_FILENAME,
  MANIFEST_FILENAME,
  type SkillsLock
} from '@internals/schemas';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { TankApiClient } from '~/lib/api-client.js';

const SCOPED_NAME_PATTERN = /^@[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;

interface VersionInfo {
  version: string;
  integrity: string;
  auditScore: number;
  auditStatus: string;
  publishedAt: string;
}

interface VersionsResponse {
  name: string;
  versions: VersionInfo[];
}

function parseLockKey(key: string): { name: string; version: string } | null {
  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0) return null;
  return { name: key.slice(0, lastAt), version: key.slice(lastAt + 1) };
}

export function registerUpdateSkillTool(server: McpServer): void {
  server.tool(
    'update-skill',
    'Update an installed skill to the latest compatible version within its declared semver range.',
    {
      name: z.string().describe('Skill name in @org/name format'),
      directory: z.string().optional().describe('Project directory (defaults to current working directory)')
    },
    async ({ name, directory }) => {
      if (!SCOPED_NAME_PATTERN.test(name)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Validation error: Skill name "${name}" must use the @org/name format (e.g. @acme/my-skill).`
            }
          ],
          isError: true
        };
      }

      const dir = directory ? path.resolve(directory) : process.cwd();

      let skillsJsonPath = path.join(dir, MANIFEST_FILENAME);
      if (!fs.existsSync(skillsJsonPath)) {
        skillsJsonPath = path.join(dir, LEGACY_MANIFEST_FILENAME);
      }
      if (!fs.existsSync(skillsJsonPath)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No ${MANIFEST_FILENAME} found in ${dir}. Run the "init-skill" tool first.`
            }
          ],
          isError: true
        };
      }

      let skillsJson: Record<string, unknown>;
      try {
        const raw = fs.readFileSync(skillsJsonPath, 'utf-8');
        skillsJson = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to read or parse ${path.basename(skillsJsonPath)}.`
            }
          ],
          isError: true
        };
      }

      const skills = (skillsJson.skills ?? {}) as Record<string, string>;
      const versionRange = skills[name];

      if (!versionRange) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Skill "${name}" is not installed (not found in ${path.basename(skillsJsonPath)}). Install it first with the install-skill tool.`
            }
          ],
          isError: true
        };
      }

      let lockPath = path.join(dir, LOCKFILE_FILENAME);
      if (!fs.existsSync(lockPath)) {
        lockPath = path.join(dir, LEGACY_LOCKFILE_FILENAME);
      }
      let currentVersion: string | null = null;

      if (fs.existsSync(lockPath)) {
        try {
          const raw = fs.readFileSync(lockPath, 'utf-8');
          const lock = JSON.parse(raw) as SkillsLock;
          for (const key of Object.keys(lock.skills)) {
            const parsed = parseLockKey(key);
            if (!parsed) continue;
            if (parsed.name === name) {
              currentVersion = parsed.version;
              break;
            }
          }
        } catch {
          // Lockfile unreadable — treat as no current version
        }
      }

      if (!currentVersion) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Skill "${name}" is not installed (not found in ${LOCKFILE_FILENAME}). Install it first with the install-skill tool.`
            }
          ],
          isError: true
        };
      }

      const client = new TankApiClient();
      if (!client.isAuthenticated) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Authentication required. Please run the "login" tool first to authenticate with Tank.'
            }
          ],
          isError: true
        };
      }

      // Fetch available versions from registry
      const encodedName = encodeURIComponent(name);
      const versionsResult = await client.fetch<VersionsResponse>(`/api/v1/skills/${encodedName}/versions`);

      if (!versionsResult.ok) {
        if (versionsResult.status === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Unable to connect to the Tank registry. Check your network connection and try again.`
              }
            ],
            isError: true
          };
        }
        if (versionsResult.status === 404) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Skill "${name}" not found in the registry.`
              }
            ],
            isError: true
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to fetch versions for ${name}: ${versionsResult.error}`
            }
          ],
          isError: true
        };
      }

      const availableVersions = versionsResult.data.versions.map((v) => v.version);

      // 6. Resolve best version within declared range
      const resolved = resolve(versionRange, availableVersions);
      if (!resolved) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No version of ${name} satisfies range "${versionRange}". Available: ${availableVersions.join(', ')}`
            }
          ],
          isError: true
        };
      }

      // 7. Check for newer major versions outside range
      const allMajors = availableVersions
        .map((v) => {
          const major = v.split('.')[0];
          return { version: v, major: Number.parseInt(major, 10) };
        })
        .filter((v) => !Number.isNaN(v.major));

      const currentMajor = Number.parseInt(currentVersion.split('.')[0], 10);
      const newerMajors = allMajors.filter((v) => v.major > currentMajor).map((v) => v.version);

      const highestOutOfRange =
        newerMajors.length > 0
          ? newerMajors.sort((a, b) => {
              const [aMaj, aMin, aPat] = a.split('.').map(Number);
              const [bMaj, bMin, bPat] = b.split('.').map(Number);
              return bMaj - aMaj || bMin - aMin || bPat - aPat;
            })[0]
          : null;

      // 8. If resolved === current, already at latest
      if (resolved === currentVersion) {
        const lines = [`Already at latest compatible version: ${name}@${resolved}`];
        if (highestOutOfRange) {
          lines.push(
            `\nNote: Version ${highestOutOfRange} is available but outside the declared range "${versionRange}". Update ${MANIFEST_FILENAME} to use it.`
          );
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: lines.join('')
            }
          ]
        };
      }

      // 9. Fetch the resolved version details for download
      const versionResult = await client.fetch<{
        version: string;
        integrity: string;
        downloadUrl: string;
        permissions: Record<string, unknown>;
        auditScore: number | null;
      }>(`/api/v1/skills/${encodedName}/${resolved}`);

      if (!versionResult.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to fetch version details for ${name}@${resolved}: ${versionResult.error}`
            }
          ],
          isError: true
        };
      }

      const versionData = versionResult.data;

      // 10. Download tarball
      let tarballBuffer: ArrayBuffer;
      try {
        const tarballRes = await fetch(versionData.downloadUrl, {
          headers: client.token ? { Authorization: `Bearer ${client.token}` } : {}
        });
        if (!tarballRes.ok) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to download tarball for ${name}@${resolved}: ${tarballRes.statusText}`
              }
            ],
            isError: true
          };
        }
        tarballBuffer = await tarballRes.arrayBuffer();
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Network error downloading ${name}@${resolved}: ${err instanceof Error ? err.message : String(err)}`
            }
          ],
          isError: true
        };
      }

      // 11. Verify SHA-512
      const { createHash } = await import('node:crypto');
      const hash = createHash('sha512').update(Buffer.from(tarballBuffer)).digest('base64');
      const computedIntegrity = `sha512-${hash}`;

      if (computedIntegrity !== versionData.integrity) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Integrity check failed for ${name}@${resolved}. The tarball has been tampered with or is corrupted.\nExpected: ${versionData.integrity}\nGot: ${computedIntegrity}`
            }
          ],
          isError: true
        };
      }

      // 12. Extract tarball to skill directory
      const { execSync } = await import('node:child_process');
      const skillDir = getSkillDir(dir, name);

      // Remove old version files if they exist
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
      }
      fs.mkdirSync(skillDir, { recursive: true });

      const tarballPath = path.join(skillDir, '__temp_tarball.tgz');
      fs.writeFileSync(tarballPath, Buffer.from(tarballBuffer));

      try {
        execSync(`tar xzf "${tarballPath}" -C "${skillDir}" --strip-components=1`, {
          stdio: 'pipe'
        });
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to extract tarball for ${name}@${resolved}: ${err instanceof Error ? err.message : String(err)}`
            }
          ],
          isError: true
        };
      } finally {
        // Clean up temp tarball
        try {
          fs.unlinkSync(tarballPath);
        } catch {
          /* ignore */
        }
      }

      // 13. Update lockfile
      let lock: SkillsLock;
      if (fs.existsSync(lockPath)) {
        try {
          const raw = fs.readFileSync(lockPath, 'utf-8');
          lock = JSON.parse(raw) as SkillsLock;
        } catch {
          lock = { lockfileVersion: 1, skills: {} };
        }
      } else {
        lock = { lockfileVersion: 1, skills: {} };
      }

      // Remove old lock entry for this skill
      for (const key of Object.keys(lock.skills)) {
        const parsed = parseLockKey(key);
        if (parsed && parsed.name === name) {
          delete lock.skills[key];
        }
      }

      // Add new lock entry
      const newLockKey = `${name}@${resolved}`;
      lock.skills[newLockKey] = {
        resolved: versionData.downloadUrl,
        integrity: versionData.integrity,
        permissions: versionData.permissions as SkillsLock['skills'][string]['permissions'],
        audit_score: versionData.auditScore
      };

      // Sort keys for deterministic output
      const sortedSkills: Record<string, unknown> = {};
      for (const key of Object.keys(lock.skills).sort()) {
        sortedSkills[key] = lock.skills[key];
      }
      lock.skills = sortedSkills as SkillsLock['skills'];

      fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

      // 14. Build response
      const lines = [
        `Updated ${name} from ${currentVersion} to ${resolved}.`,
        `Integrity verified (SHA-512).`,
        `Lockfile updated.`
      ];

      if (highestOutOfRange) {
        lines.push(
          `\nNote: Version ${highestOutOfRange} is available but outside the declared range "${versionRange}". Update ${MANIFEST_FILENAME} to use it.`
        );
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: lines.join('\n')
          }
        ]
      };
    }
  );
}

function getSkillDir(projectDir: string, skillName: string): string {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(projectDir, '.tank', 'skills', scope, name);
  }
  return path.join(projectDir, '.tank', 'skills', skillName);
}

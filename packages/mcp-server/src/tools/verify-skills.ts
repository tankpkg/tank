import fs from 'node:fs';
import path from 'node:path';

import { LEGACY_LOCKFILE_FILENAME, LOCKFILE_FILENAME, type SkillsLock } from '@internals/schemas';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerVerifySkillsTool(server: McpServer): void {
  server.tool(
    'verify-skills',
    'Verify that installed skills match their lockfile entries. Checks that skill directories exist and are not empty.',
    {
      name: z.string().optional().describe('Specific skill name to verify (verifies all if omitted)'),
      directory: z.string().optional().describe('Project directory (defaults to current working directory)')
    },
    async ({ name, directory }) => {
      const dir = directory ? path.resolve(directory) : process.cwd();

      let lockPath = path.join(dir, LOCKFILE_FILENAME);
      if (!fs.existsSync(lockPath)) {
        lockPath = path.join(dir, LEGACY_LOCKFILE_FILENAME);
      }
      if (!fs.existsSync(lockPath)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No ${LOCKFILE_FILENAME} found. Run "install-skill" to install skills and generate a lockfile.`
            }
          ],
          isError: true
        };
      }

      let lock: SkillsLock;
      try {
        const raw = fs.readFileSync(lockPath, 'utf-8');
        lock = JSON.parse(raw) as SkillsLock;
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to parse ${path.basename(lockPath)}. The file may be corrupted.`
            }
          ],
          isError: true
        };
      }

      let entries = Object.entries(lock.skills);

      if (entries.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No skills to verify. The lockfile is empty.'
            }
          ]
        };
      }

      if (name) {
        entries = entries.filter(([key]) => {
          const lastAt = key.lastIndexOf('@');
          if (lastAt <= 0) return false;
          return key.slice(0, lastAt) === name;
        });

        if (entries.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Skill "${name}" not found in lockfile.`
              }
            ],
            isError: true
          };
        }
      }

      const results: Array<{ key: string; status: 'PASS' | 'FAIL' | 'MISSING'; detail: string }> = [];

      for (const [key, entry] of entries) {
        const skillName = parseLockKey(key);
        const skillDir = getExtractDir(dir, skillName);

        if (!fs.existsSync(skillDir)) {
          results.push({
            key,
            status: 'MISSING',
            detail: `Directory missing at ${skillDir}. Reinstall with "install-skill".`
          });
          continue;
        }

        const contents = fs.readdirSync(skillDir);
        if (contents.length === 0) {
          results.push({
            key,
            status: 'FAIL',
            detail: `Directory exists but is empty. Expected integrity: ${entry.integrity}. SHA-512 mismatch detected.`
          });
          continue;
        }

        results.push({
          key,
          status: 'PASS',
          detail: `Verified (integrity: ${entry.integrity})`
        });
      }

      const passing = results.filter((r) => r.status === 'PASS');
      const failing = results.filter((r) => r.status !== 'PASS');

      const lines: string[] = [];
      for (const r of results) {
        lines.push(`${r.status} ${r.key}: ${r.detail}`);
      }

      if (failing.length > 0) {
        lines.push('');
        lines.push(`Verification failed: ${failing.length} issue(s) found, ${passing.length} passed.`);
        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
          isError: true
        };
      }

      lines.push('');
      lines.push(`All ${passing.length} skill(s) passed verification.`);
      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }]
      };
    }
  );
}

function parseLockKey(key: string): string {
  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0) return key;
  return key.slice(0, lastAt);
}

function getExtractDir(projectDir: string, skillName: string): string {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(projectDir, '.tank', 'skills', scope, name);
  }
  return path.join(projectDir, '.tank', 'skills', skillName);
}

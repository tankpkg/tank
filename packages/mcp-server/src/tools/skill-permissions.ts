import fs from 'node:fs';
import path from 'node:path';
import {
  LEGACY_LOCKFILE_FILENAME,
  LEGACY_MANIFEST_FILENAME,
  LOCKFILE_FILENAME,
  MANIFEST_FILENAME,
  type Permissions,
  type SkillsJson,
  type SkillsLock
} from '@internal/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function parseSkillName(key: string): string {
  const lastAt = key.lastIndexOf('@');
  if (lastAt > 0) {
    return key.slice(0, lastAt);
  }
  return key;
}

interface PermissionEntry {
  value: string;
  skills: string[];
}

interface ResolvedPermissions {
  networkOutbound: PermissionEntry[];
  filesystemRead: PermissionEntry[];
  filesystemWrite: PermissionEntry[];
  subprocess: string[];
  env: PermissionEntry[];
  exec: PermissionEntry[];
}

function collectPermissions(lockfile: SkillsLock): ResolvedPermissions {
  const networkMap = new Map<string, string[]>();
  const fsReadMap = new Map<string, string[]>();
  const fsWriteMap = new Map<string, string[]>();
  const subprocessSkills: string[] = [];
  const envMap = new Map<string, string[]>();
  const execMap = new Map<string, string[]>();

  for (const [key, entry] of Object.entries(lockfile.skills)) {
    const skillName = parseSkillName(key);
    const perms = entry.permissions;

    if (perms.network?.outbound) {
      for (const domain of perms.network.outbound) {
        const existing = networkMap.get(domain) ?? [];
        existing.push(skillName);
        networkMap.set(domain, existing);
      }
    }

    if (perms.filesystem?.read) {
      for (const p of perms.filesystem.read) {
        const existing = fsReadMap.get(p) ?? [];
        existing.push(skillName);
        fsReadMap.set(p, existing);
      }
    }

    if (perms.filesystem?.write) {
      for (const p of perms.filesystem.write) {
        const existing = fsWriteMap.get(p) ?? [];
        existing.push(skillName);
        fsWriteMap.set(p, existing);
      }
    }

    if (perms.subprocess === true) {
      subprocessSkills.push(skillName);
    }

    const rawPerms = perms as Record<string, unknown>;
    if (Array.isArray(rawPerms.env)) {
      for (const envVar of rawPerms.env as string[]) {
        const existing = envMap.get(envVar) ?? [];
        existing.push(skillName);
        envMap.set(envVar, existing);
      }
    }

    if (Array.isArray(rawPerms.exec)) {
      for (const cmd of rawPerms.exec as string[]) {
        const existing = execMap.get(cmd) ?? [];
        existing.push(skillName);
        execMap.set(cmd, existing);
      }
    }
  }

  const toEntries = (map: Map<string, string[]>): PermissionEntry[] =>
    Array.from(map.entries()).map(([value, skills]) => ({ value, skills }));

  return {
    networkOutbound: toEntries(networkMap),
    filesystemRead: toEntries(fsReadMap),
    filesystemWrite: toEntries(fsWriteMap),
    subprocess: subprocessSkills,
    env: toEntries(envMap),
    exec: toEntries(execMap)
  };
}

function formatAttribution(skills: string[]): string {
  return `<- ${skills.join(', ')}`;
}

function formatSection(title: string, entries: PermissionEntry[]): string {
  const lines: string[] = [];
  lines.push(`${title}:`);
  if (entries.length === 0) {
    lines.push('  none');
  } else {
    for (const entry of entries) {
      lines.push(`  ${entry.value}    ${formatAttribution(entry.skills)}`);
    }
  }
  return lines.join('\n');
}

// Wildcard matching: *.example.com matches sub.example.com, * matches all
function isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
  for (const allowed of allowedDomains) {
    if (allowed === '*') return true;
    if (allowed === domain) return true;
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1);
      if (domain.endsWith(suffix) || domain === allowed.slice(2)) {
        return true;
      }
      if (domain === allowed) return true;
    }
  }
  return false;
}

// Glob matching: ./src/** matches ./src/foo/bar
function isPathAllowed(requestedPath: string, allowedPaths: string[]): boolean {
  for (const allowed of allowedPaths) {
    if (allowed === requestedPath) return true;
    if (allowed.endsWith('/**')) {
      const prefix = allowed.slice(0, -3);
      if (requestedPath.startsWith(prefix)) return true;
    }
  }
  return false;
}

interface BudgetViolation {
  category: string;
  value: string;
  skills: string[];
}

function checkBudget(resolved: ResolvedPermissions, budget: Permissions): BudgetViolation[] {
  const violations: BudgetViolation[] = [];

  const budgetDomains = budget.network?.outbound ?? [];
  for (const entry of resolved.networkOutbound) {
    if (!isDomainAllowed(entry.value, budgetDomains)) {
      violations.push({
        category: 'network outbound',
        value: entry.value,
        skills: entry.skills
      });
    }
  }

  const budgetReadPaths = budget.filesystem?.read ?? [];
  for (const entry of resolved.filesystemRead) {
    if (!isPathAllowed(entry.value, budgetReadPaths)) {
      violations.push({
        category: 'filesystem read',
        value: entry.value,
        skills: entry.skills
      });
    }
  }

  const budgetWritePaths = budget.filesystem?.write ?? [];
  for (const entry of resolved.filesystemWrite) {
    if (!isPathAllowed(entry.value, budgetWritePaths)) {
      violations.push({
        category: 'filesystem write',
        value: entry.value,
        skills: entry.skills
      });
    }
  }

  if (resolved.subprocess.length > 0 && budget.subprocess !== true) {
    violations.push({
      category: 'subprocess',
      value: 'subprocess access',
      skills: resolved.subprocess
    });
  }

  return violations;
}

export function registerSkillPermissionsTool(server: McpServer): void {
  server.tool(
    'skill-permissions',
    'Display resolved permission summary for installed skills. Shows what capabilities each skill requires and checks against the project permission budget.',
    {
      directory: z.string().optional().describe('Project directory path (defaults to current working directory)')
    },
    async ({ directory }) => {
      const dir = directory ? path.resolve(directory) : process.cwd();

      if (!fs.existsSync(dir)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Directory does not exist: ${dir}`
            }
          ],
          isError: true
        };
      }

      let skillsJsonPath = path.join(dir, MANIFEST_FILENAME);
      if (!fs.existsSync(skillsJsonPath)) {
        skillsJsonPath = path.join(dir, LEGACY_MANIFEST_FILENAME);
      }
      if (!fs.existsSync(skillsJsonPath)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No ${MANIFEST_FILENAME} found. Run "init-skill" to create one.`
            }
          ],
          isError: true
        };
      }

      let skillsJson: SkillsJson;
      try {
        const raw = fs.readFileSync(skillsJsonPath, 'utf-8');
        skillsJson = JSON.parse(raw) as SkillsJson;
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to parse ${path.basename(skillsJsonPath)}. The file may be corrupted.`
            }
          ],
          isError: true
        };
      }

      const skillDeps = skillsJson.skills ?? {};
      if (Object.keys(skillDeps).length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No skills with permissions to display. The project has no skill dependencies.'
            }
          ]
        };
      }

      let lockfilePath = path.join(dir, LOCKFILE_FILENAME);
      if (!fs.existsSync(lockfilePath)) {
        lockfilePath = path.join(dir, LEGACY_LOCKFILE_FILENAME);
      }
      if (!fs.existsSync(lockfilePath)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No ${LOCKFILE_FILENAME} found. Skills are declared but not installed. Run install to generate a lockfile.`
            }
          ]
        };
      }

      let lockfile: SkillsLock;
      try {
        const raw = fs.readFileSync(lockfilePath, 'utf-8');
        lockfile = JSON.parse(raw) as SkillsLock;
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to parse ${path.basename(lockfilePath)}. The file may be corrupted.`
            }
          ],
          isError: true
        };
      }

      if (!lockfile.skills || Object.keys(lockfile.skills).length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No skills installed. The lockfile is empty.'
            }
          ]
        };
      }

      const resolved = collectPermissions(lockfile);

      const lines: string[] = [];
      lines.push('Resolved permissions for this project:');
      lines.push('');

      lines.push(formatSection('Network (outbound)', resolved.networkOutbound));
      lines.push(formatSection('Filesystem (read)', resolved.filesystemRead));
      lines.push(formatSection('Filesystem (write)', resolved.filesystemWrite));

      lines.push('Subprocess:');
      if (resolved.subprocess.length === 0) {
        lines.push('  none');
      } else {
        lines.push(`  allowed    ${formatAttribution(resolved.subprocess)}`);
      }

      if (resolved.env.length > 0) {
        lines.push(formatSection('Environment variables', resolved.env));
      }

      if (resolved.exec.length > 0) {
        lines.push(formatSection('Exec', resolved.exec));
      }

      lines.push('');
      lines.push('Per-skill breakdown:');
      for (const [key, entry] of Object.entries(lockfile.skills)) {
        const skillName = parseSkillName(key);
        const perms = entry.permissions;
        const permParts: string[] = [];

        if (perms.network?.outbound && perms.network.outbound.length > 0) {
          permParts.push(`network: ${perms.network.outbound.join(', ')}`);
        }
        if (perms.filesystem?.read && perms.filesystem.read.length > 0) {
          permParts.push(`filesystem:read: ${perms.filesystem.read.join(', ')}`);
        }
        if (perms.filesystem?.write && perms.filesystem.write.length > 0) {
          permParts.push(`filesystem:write: ${perms.filesystem.write.join(', ')}`);
        }
        if (perms.subprocess === true) {
          permParts.push('subprocess: allowed');
        }

        const rawPerms = perms as Record<string, unknown>;
        if (Array.isArray(rawPerms.env) && (rawPerms.env as string[]).length > 0) {
          permParts.push(`env: ${(rawPerms.env as string[]).join(', ')}`);
        }
        if (Array.isArray(rawPerms.exec) && (rawPerms.exec as string[]).length > 0) {
          permParts.push(`exec: ${(rawPerms.exec as string[]).join(', ')}`);
        }

        if (permParts.length === 0) {
          lines.push(`  ${skillName}: no special permissions`);
        } else {
          lines.push(`  ${skillName}: ${permParts.join('; ')}`);
        }
      }

      const budget = skillsJson.permissions;
      lines.push('');

      if (!budget) {
        lines.push('Budget status: No budget defined');
      } else {
        const violations = checkBudget(resolved, budget);

        if (violations.length === 0) {
          lines.push('Budget status: PASS (all within budget)');
        } else {
          lines.push('Budget status: FAIL');
          for (const v of violations) {
            lines.push(`  - ${v.category}: "${v.value}" not in budget (requested by ${v.skills.join(', ')})`);
          }
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }]
      };
    }
  );
}

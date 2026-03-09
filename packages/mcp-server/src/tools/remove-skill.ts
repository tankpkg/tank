import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type SkillsLock, LOCKFILE_VERSION, MANIFEST_FILENAME, LEGACY_MANIFEST_FILENAME, LOCKFILE_FILENAME, LEGACY_LOCKFILE_FILENAME } from '@tank/shared';
import { z } from 'zod';

const SCOPED_NAME_PATTERN = /^@[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;

export function registerRemoveSkillTool(server: McpServer): void {
  server.tool(
    'remove-skill',
    `Remove an installed skill from the project. Removes from ${MANIFEST_FILENAME}, ${LOCKFILE_FILENAME}, and deletes skill files.`,
    {
      name: z.string().describe('Skill name in @org/name format'),
      directory: z.string().optional().describe('Project directory (defaults to current working directory)'),
    },
    async ({ name, directory }) => {
      if (!SCOPED_NAME_PATTERN.test(name)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Validation error: Skill name "${name}" must use the @org/name format (e.g. @acme/my-skill).`,
          }],
          isError: true,
        };
      }

      const dir = directory ? path.resolve(directory) : process.cwd();
      const results: string[] = [];
      let skillFoundAnywhere = false;

      // Find manifest (tank.json or skills.json)
      let skillsJsonPath = path.join(dir, MANIFEST_FILENAME);
      if (!fs.existsSync(skillsJsonPath)) {
        skillsJsonPath = path.join(dir, LEGACY_MANIFEST_FILENAME);
      }
      if (fs.existsSync(skillsJsonPath)) {
        try {
          const raw = fs.readFileSync(skillsJsonPath, 'utf-8');
          const skillsJson = JSON.parse(raw) as Record<string, unknown>;
          const skills = (skillsJson.skills ?? {}) as Record<string, string>;

          if (name in skills) {
            skillFoundAnywhere = true;
            delete skills[name];
            skillsJson.skills = skills;
            fs.writeFileSync(skillsJsonPath, JSON.stringify(skillsJson, null, 2) + '\n');
            results.push(`Removed "${name}" from ${path.basename(skillsJsonPath)}`);
          }
        } catch {
          results.push(`Warning: Failed to read or parse ${path.basename(skillsJsonPath)}`);
        }
      }

      // Find lockfile (tank.lock or skills.lock)
      let lockPath = path.join(dir, LOCKFILE_FILENAME);
      if (!fs.existsSync(lockPath)) {
        lockPath = path.join(dir, LEGACY_LOCKFILE_FILENAME);
      }
      if (fs.existsSync(lockPath)) {
        try {
          const raw = fs.readFileSync(lockPath, 'utf-8');
          const lock = JSON.parse(raw) as SkillsLock;
          let removedFromLock = false;

          for (const key of Object.keys(lock.skills)) {
            const lastAt = key.lastIndexOf('@');
            if (lastAt <= 0) continue;
            const keyName = key.slice(0, lastAt);
            if (keyName === name) {
              delete lock.skills[key];
              removedFromLock = true;
              skillFoundAnywhere = true;
            }
          }

          if (removedFromLock) {
            const sortedSkills: Record<string, unknown> = {};
            for (const key of Object.keys(lock.skills).sort()) {
              sortedSkills[key] = lock.skills[key];
            }
            lock.skills = sortedSkills as SkillsLock['skills'];
            fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
            results.push(`Removed "${name}" from ${path.basename(lockPath)}`);
          }
        } catch {
          results.push(`Warning: Failed to read or parse ${path.basename(lockPath)}`);
        }
      }

      const skillDir = getSkillDir(dir, name);
      if (fs.existsSync(skillDir)) {
        skillFoundAnywhere = true;
        fs.rmSync(skillDir, { recursive: true, force: true });
        results.push(`Deleted skill files from ${skillDir}`);
      } else {
        results.push(`Skill files were already absent from ${skillDir}`);
      }

      const symlinkName = name.replace(/\//g, '__');
      const agentSkillDir = path.join(dir, '.tank', 'agent-skills', symlinkName);
      if (fs.existsSync(agentSkillDir)) {
        fs.rmSync(agentSkillDir, { recursive: true, force: true });
        results.push('Removed symlink from agent workspace');
      }

      if (!skillFoundAnywhere) {
        return {
          content: [{
            type: 'text' as const,
            text: `Skill "${name}" is not installed. It was not found in ${MANIFEST_FILENAME}, ${LOCKFILE_FILENAME}, or .tank/skills/.`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Successfully removed ${name}.\n${results.join('\n')}`,
        }],
      };
    },
  );
}

function getSkillDir(projectDir: string, skillName: string): string {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(projectDir, '.tank', 'skills', scope, name);
  }
  return path.join(projectDir, '.tank', 'skills', skillName);
}

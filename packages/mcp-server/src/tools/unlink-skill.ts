import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const SCOPED_NAME_PATTERN = /^@[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;

export function registerUnlinkSkillTool(server: McpServer): void {
  server.tool(
    'unlink-skill',
    'Unlink a skill from an agent workspace. Removes the symlink without deleting the installed skill files.',
    {
      name: z.string().describe('Skill name in @org/name format'),
      workspace: z.string().describe('Agent workspace directory path'),
      directory: z.string().optional().describe('Project directory where skills are installed (defaults to current working directory)'),
    },
    async ({ name, workspace, directory }) => {
      if (!SCOPED_NAME_PATTERN.test(name)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Validation error: Skill name "${name}" must use the @org/name format (e.g. @acme/my-skill).`,
          }],
          isError: true,
        };
      }

      const projectDir = directory ? path.resolve(directory) : process.cwd();
      const workspaceDir = path.resolve(workspace);

      if (!fs.existsSync(workspaceDir)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Workspace directory does not exist: ${workspaceDir}`,
          }],
          isError: true,
        };
      }

      const skillDir = getSkillDir(projectDir, name);
      if (!fs.existsSync(skillDir)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Skill "${name}" is not installed. It was not found in ${skillDir}.`,
          }],
          isError: true,
        };
      }

      const [scope, skillName] = name.split('/');
      const symlinkPath = path.join(workspaceDir, '.skills', scope, skillName);

      try {
        const stats = fs.lstatSync(symlinkPath);
        if (stats.isSymbolicLink()) {
          fs.unlinkSync(symlinkPath);
          return {
            content: [{
              type: 'text' as const,
              text: `Successfully unlinked "${name}" from ${workspaceDir}.\nRemoved symlink: ${symlinkPath}`,
            }],
          };
        }
      } catch {
      }

      return {
        content: [{
          type: 'text' as const,
          text: `No link exists for "${name}" in ${workspaceDir}.`,
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

import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const SCOPED_NAME_PATTERN = /^@[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;

export function registerLinkSkillTool(server: McpServer): void {
  server.tool(
    'link-skill',
    'Link an installed skill into an agent workspace. Creates a symlink from the workspace .skills directory to the installed skill.',
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
            text: `Skill "${name}" is not installed. Install it first with "install-skill" before linking.`,
          }],
          isError: true,
        };
      }

      const [scope, skillName] = name.split('/');
      const skillsLinkDir = path.join(workspaceDir, '.skills', scope);
      const symlinkPath = path.join(skillsLinkDir, skillName);

      try {
        const stats = fs.lstatSync(symlinkPath);
        if (stats.isSymbolicLink()) {
          const currentTarget = fs.readlinkSync(symlinkPath);
          const resolvedTarget = path.isAbsolute(currentTarget)
            ? currentTarget
            : path.resolve(path.dirname(symlinkPath), currentTarget);

          if (path.resolve(resolvedTarget) === path.resolve(skillDir)) {
            return {
              content: [{
                type: 'text' as const,
                text: `Skill "${name}" is already linked in ${workspaceDir}.`,
              }],
            };
          }

          fs.unlinkSync(symlinkPath);
        }
      } catch {
      }

      fs.mkdirSync(skillsLinkDir, { recursive: true });
      fs.symlinkSync(skillDir, symlinkPath, 'dir');

      return {
        content: [{
          type: 'text' as const,
          text: `Successfully linked "${name}" into ${workspaceDir}.\nSymlink: ${symlinkPath} → ${skillDir}`,
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

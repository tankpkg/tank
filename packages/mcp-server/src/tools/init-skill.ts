import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { skillsJsonSchema, type SkillsJson, MANIFEST_FILENAME, LEGACY_MANIFEST_FILENAME } from '@tank/shared';
import { z } from 'zod';

const SCOPED_NAME_PATTERN = /^@[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

export function registerInitSkillTool(server: McpServer): void {
  server.tool(
    'init-skill',
    `Create a new ${MANIFEST_FILENAME} and SKILL.md template for a Tank skill.`,
    {
      name: z.string().regex(SCOPED_NAME_PATTERN, 'Name must be in @org/name format'),
      version: z.string().regex(SEMVER_PATTERN, 'Version must be valid semver').optional().default('0.1.0'),
      description: z.string().optional().default(''),
      directory: z.string().optional().default('.'),
    },
    async ({ name, version = '0.1.0', description = '', directory = '.' }) => {
      const targetDir = path.resolve(directory);

      if (!fs.existsSync(targetDir)) {
        return {
          content: [{ type: 'text' as const, text: `Directory does not exist: ${targetDir}` }],
        };
      }

      if (!fs.statSync(targetDir).isDirectory()) {
        return {
          content: [{ type: 'text' as const, text: `Path is not a directory: ${targetDir}` }],
        };
      }

      // Check for existing manifest (tank.json or skills.json)
      const newManifestPath = path.join(targetDir, MANIFEST_FILENAME);
      const legacyManifestPath = path.join(targetDir, LEGACY_MANIFEST_FILENAME);
      const skillsJsonPath = newManifestPath;
      if (fs.existsSync(newManifestPath) || fs.existsSync(legacyManifestPath)) {
        const existingFile = fs.existsSync(newManifestPath) ? MANIFEST_FILENAME : LEGACY_MANIFEST_FILENAME;
        return {
          content: [{ type: 'text' as const, text: `${existingFile} already exists at ${targetDir}. Aborting to avoid overwrite.` }],
        };
      }

      const manifest: SkillsJson = {
        name,
        version,
        description,
        skills: {},
        permissions: {
          network: { outbound: [] },
          filesystem: { read: [], write: [] },
          subprocess: false,
        },
      };

      const parseResult = skillsJsonSchema.safeParse(manifest);
      if (!parseResult.success) {
        const details = parseResult.error.issues
          .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
          .join('; ');

        return {
          content: [{ type: 'text' as const, text: `Failed to create ${MANIFEST_FILENAME}: ${details}` }],
        };
      }

      fs.writeFileSync(skillsJsonPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

      const skillMdPath = path.join(targetDir, 'SKILL.md');
      let createdSkillMd = false;
      if (!fs.existsSync(skillMdPath)) {
        const skillMd = `# ${name}\n\n${description || 'Description here.'}\n`;
        fs.writeFileSync(skillMdPath, skillMd, 'utf-8');
        createdSkillMd = true;
      }

      const skillMdLine = createdSkillMd
        ? `Created: ${skillMdPath}`
        : `Skipped existing: ${skillMdPath}`;

      return {
        content: [
          {
            type: 'text' as const,
            text: `Initialized skill in ${targetDir}\nCreated: ${skillsJsonPath}\n${skillMdLine}`,
          },
        ],
      };
    },
  );
}

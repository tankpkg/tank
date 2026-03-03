import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TankApiClient } from '../lib/api-client.js';

interface SkillVersion {
  version: string;
  integrity: string;
  auditScore: number | null;
  auditStatus: string;
  publishedAt: string;
  tarballSize: number;
  fileCount: number;
}

interface SkillInfoResponse {
  name: string;
  description: string | null;
  publisher: string;
  latestVersion: string;
  auditScore: number | null;
  auditStatus: string;
  downloads: number;
  permissions: Record<string, unknown> | null;
  versions: SkillVersion[];
  readme: string | null;
}

export function registerSkillInfoTool(server: McpServer): void {
  const client = new TankApiClient();

  server.tool(
    'skill-info',
    'Get detailed information about a specific skill from the Tank registry',
    {
      name: z.string().describe('Skill name (e.g., @org/skill-name or skill-name)'),
    },
    async ({ name }) => {
      const result = await client.fetch<SkillInfoResponse>(
        `/api/v1/skills/${encodeURIComponent(name)}`,
      );

      if (!result.ok) {
        if (result.status === 404) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Skill "${name}" not found. Search for skills: https://tankpkg.dev/search`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to get skill info: ${result.error}`,
            },
          ],
        };
      }

      const skill = result.data;
      const score = skill.auditScore !== null ? `${skill.auditScore.toFixed(1)}/10` : 'Not scored';
      const size = skill.versions[0]
        ? `${(skill.versions[0].tarballSize / 1024).toFixed(1)}KB`
        : 'Unknown';

      // Format permissions as readable text
      let permsText = 'None declared';
      if (skill.permissions) {
        const perms: string[] = [];
        const p = skill.permissions as {
          network?: { outbound?: string[] };
          filesystem?: { read?: string[]; write?: string[] };
          subprocess?: boolean;
        };
        if (p.network?.outbound?.length) {
          perms.push(`network: ${p.network.outbound.join(', ')}`);
        }
        if (p.filesystem?.read?.length || p.filesystem?.write?.length) {
          const fsPerms: string[] = [];
          if (p.filesystem.read?.length) fsPerms.push(`read: ${p.filesystem.read.length} paths`);
          if (p.filesystem.write?.length) fsPerms.push(`write: ${p.filesystem.write.length} paths`);
          perms.push(`filesystem (${fsPerms.join(', ')})`);
        }
        if (p.subprocess) perms.push('subprocess: allowed');
        if (perms.length > 0) permsText = perms.join('\n  - ');
      }

      const versionsList = skill.versions
        .slice(0, 5)
        .map((v) => {
          const vScore = v.auditScore !== null ? v.auditScore.toFixed(1) : '-';
          return `${v.version} (score: ${vScore})`;
        })
        .join('\n  - ');

      const text = [
        `# ${skill.name}`,
        '',
        `**Publisher:** ${skill.publisher}`,
        `**Latest:** ${skill.latestVersion}`,
        `**Score:** ${score}`,
        `**Size:** ${size}`,
        `**Downloads:** ${skill.downloads}`,
        '',
        '**Description:**',
        skill.description ?? 'No description available',
        '',
        '**Permissions:**',
        `  - ${permsText}`,
        '',
        '**Versions:**',
        `  - ${versionsList}`,
        skill.versions.length > 5 ? `\n  ... and ${skill.versions.length - 5} more` : '',
        '',
        `View on Tank: https://tankpkg.dev/skills/${skill.name}`,
      ].join('\n');

      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );
}

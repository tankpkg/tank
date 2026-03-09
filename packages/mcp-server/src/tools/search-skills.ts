import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TankApiClient } from '../lib/api-client.js';

interface SearchResult {
  name: string;
  version: string;
  description: string | null;
  auditScore: number | null;
  downloads: number;
  publisher: string;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
}

export function registerSearchSkillsTool(server: McpServer): void {
  const client = new TankApiClient();

  server.tool(
    'search-skills',
    'Search the Tank registry for AI agent skills',
    {
      query: z.string().min(1).describe('Search query (skill name or keywords)'),
      limit: z.number().min(1).max(50).optional().default(10).describe('Maximum results to return')
    },
    async ({ query, limit }) => {
      const result = await client.fetch<SearchResponse>(`/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`);

      if (!result.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Search failed: ${result.error}`
            }
          ]
        };
      }

      const { results, total } = result.data;

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No skills found matching "${query}". Try different keywords or browse the registry at https://tankpkg.dev`
            }
          ]
        };
      }

      // Format as markdown table
      const header = '| Skill | Score | Downloads | Description |\n|-------|-------|-----------|-------------|';
      const rows = results.map((skill) => {
        const score = skill.auditScore !== null ? skill.auditScore.toFixed(1) : '-';
        const downloads =
          skill.downloads > 1000 ? `${(skill.downloads / 1000).toFixed(1)}k` : skill.downloads.toString();
        const desc = skill.description?.slice(0, 50) ?? 'No description';
        return `| ${skill.name} | ${score} | ${downloads} | ${desc} |`;
      });

      const text = [
        `Found ${total} skill${total !== 1 ? 's' : ''} matching "${query}":`,
        '',
        header,
        ...rows,
        '',
        `View full results: https://tankpkg.dev/search?q=${encodeURIComponent(query)}`
      ].join('\n');

      return {
        content: [{ type: 'text' as const, text }]
      };
    }
  );
}

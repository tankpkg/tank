import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TankApiClient } from '../lib/api-client.js';
import { type PackResult, pack } from '../lib/packer.js';

interface PublishStartResponse {
  uploadUrl: string;
  skillId: string;
  versionId: string;
}

interface PublishConfirmResponse {
  success: boolean;
  name: string;
  version: string;
  auditScore: number | null;
  scanVerdict: string | null;
}

export function registerPublishSkillTool(server: McpServer): void {
  server.tool(
    'publish-skill',
    'Publish a skill to the Tank registry. Requires authentication.',
    {
      directory: z.string().optional().describe('Directory to publish (default: current directory)'),
      visibility: z.enum(['public', 'private']).optional().default('public').describe('Package visibility'),
      dryRun: z.boolean().optional().default(false).describe('Validate without publishing')
    },
    async ({ directory = '.', visibility = 'public', dryRun = false }) => {
      const absDir = path.resolve(directory);
      const client = new TankApiClient();

      // Check auth (skip for dry run)
      if (!dryRun && !client.isAuthenticated) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'You need to log in first. Use the login tool to authenticate with Tank.\n\nExample: "Log in to Tank"'
            }
          ]
        };
      }

      if (!dryRun) {
        const authCheck = await client.verifyAuth();
        if (!authCheck.valid) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Your session has expired. Use the login tool to authenticate again.'
              }
            ]
          };
        }
      }

      // Pack the skill
      let packResult: PackResult;
      try {
        packResult = await pack(absDir);
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to pack skill: ${err instanceof Error ? err.message : String(err)}`
            }
          ]
        };
      }

      const manifest = packResult.manifest as { name?: string; version?: string; description?: string };
      const skillName = manifest.name ?? 'unknown';
      const skillVersion = manifest.version ?? '0.0.0';

      // Dry run: just validate and return summary
      if (dryRun) {
        const lines: string[] = [
          `## Dry Run for ${skillName}@${skillVersion}`,
          '',
          '**Validation:** ✅ PASSED',
          '',
          '### Package Summary',
          `- **Name:** ${skillName}`,
          `- **Version:** ${skillVersion}`,
          `- **Visibility:** ${visibility}`,
          `- **Files:** ${packResult.fileCount}`,
          `- **Size:** ${(packResult.totalSize / 1024).toFixed(1)}KB compressed`,
          `- **Integrity:** ${packResult.integrity.slice(0, 20)}...`,
          '',
          '### Manifest',
          `- **Description:** ${manifest.description ?? 'No description'}`,
          `- **Permissions:** ${JSON.stringify((manifest as Record<string, unknown>).permissions ?? {})}`,
          '',
          '### Files',
          ...packResult.files.slice(0, 10).map((f) => `  - ${f}`),
          packResult.files.length > 10 ? `  ... and ${packResult.files.length - 10} more` : '',
          '',
          'Ready to publish. Say "publish my skill" when you\'re ready.'
        ];

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }]
        };
      }

      // Step 1: Start publish flow
      const startResult = await client.fetch<PublishStartResponse>('/api/v1/skills', {
        method: 'POST',
        body: JSON.stringify({
          manifest: { ...manifest, visibility },
          readme: packResult.readme,
          files: packResult.files
        })
      });

      if (!startResult.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to start publish: ${startResult.error}`
            }
          ]
        };
      }

      const { uploadUrl, versionId } = startResult.data;

      // Step 2: Upload tarball
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/gzip'
        },
        body: new Uint8Array(packResult.tarball)
      });

      if (!uploadRes.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to upload tarball: ${uploadRes.statusText}`
            }
          ]
        };
      }

      // Step 3: Confirm upload
      const confirmResult = await client.fetch<PublishConfirmResponse>('/api/v1/skills/confirm', {
        method: 'POST',
        body: JSON.stringify({
          versionId,
          integrity: packResult.integrity,
          fileCount: packResult.fileCount,
          tarballSize: packResult.tarball.length,
          readme: packResult.readme
        })
      });

      if (!confirmResult.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to confirm publish: ${confirmResult.error}`
            }
          ]
        };
      }

      const confirm = confirmResult.data;
      const score = confirm.auditScore !== null ? `${confirm.auditScore.toFixed(1)}/10` : 'pending';

      const lines: string[] = [
        `## Published ${confirm.name}@${confirm.version}`,
        '',
        `**Status:** ✅ Successfully published`,
        `**Visibility:** ${visibility}`,
        `**Audit Score:** ${score}`,
        `**Scan Verdict:** ${confirm.scanVerdict ?? 'pending'}`,
        '',
        '### Package Details',
        `- **Files:** ${packResult.fileCount}`,
        `- **Size:** ${(packResult.totalSize / 1024).toFixed(1)}KB`,
        '',
        `View your skill: https://tankpkg.dev/skills/${confirm.name}`
      ];

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }]
      };
    }
  );
}

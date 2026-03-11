import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TankApiClient } from '../lib/api-client.js';
import { getConfig, setConfig } from '../lib/config.js';

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function registerLoginTool(server: McpServer): void {
  server.tool(
    'login',
    'Authenticate with Tank using GitHub OAuth device flow. Opens browser for authorization.',
    {
      timeout: z.number().optional().describe('Timeout in milliseconds (default: 300000 = 5 minutes)')
    },
    async ({ timeout = DEFAULT_TIMEOUT_MS }) => {
      const client = new TankApiClient();
      const config = getConfig();

      // Check if already logged in with valid token
      if (config.token) {
        const authCheck = await client.verifyAuth();
        if (authCheck.valid) {
          const displayName = authCheck.user?.name ?? authCheck.user?.email ?? 'unknown user';
          return {
            content: [
              {
                type: 'text' as const,
                text: `Already logged in as ${displayName}.\n\nTo log out, delete ~/.tank/config.json or use the CLI: tank logout`
              }
            ]
          };
        }
      }

      // Start device flow
      const state = crypto.randomUUID();
      const startRes = await fetch(`${config.registry}/api/v1/cli-auth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
      });

      if (!startRes.ok) {
        const body = await startRes.json().catch(() => ({}));
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to start login flow: ${(body as { error?: string }).error ?? startRes.statusText}`
            }
          ]
        };
      }

      const { sessionCode } = (await startRes.json()) as {
        sessionCode: string;
      };

      // Return auth URL and poll for completion
      const deadline = Date.now() + timeout;
      const _authorized = false;
      let lastStatus = '';

      while (Date.now() < deadline) {
        try {
          const exchangeRes = await fetch(`${config.registry}/api/v1/cli-auth/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionCode, state })
          });

          if (exchangeRes.ok) {
            const { token, user } = (await exchangeRes.json()) as {
              token: string;
              user: { name: string | null; email: string | null };
            };

            // Save token to config
            setConfig({ token, user: user as { name: string; email: string } });

            const displayName = user.name ?? user.email ?? 'unknown user';
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Successfully logged in as ${displayName}!\n\nYou can now use all Tank MCP tools: scan-skill, publish-skill, etc.`
                }
              ]
            };
          }

          // 400 means not yet authorized - keep polling
          if (exchangeRes.status !== 400) {
            const body = await exchangeRes.json().catch(() => ({}));
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Login failed: ${(body as { error?: string }).error ?? exchangeRes.statusText}`
                }
              ]
            };
          }

          // Check status and provide updates
          const newStatus = 'Waiting for authorization...';
          if (newStatus !== lastStatus) {
            lastStatus = newStatus;
          }
        } catch {
          // Network errors during polling are transient
        }

        await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Login timed out. The authorization link may have expired.\n\nTry again: tank login`
          }
        ]
      };
    }
  );
}

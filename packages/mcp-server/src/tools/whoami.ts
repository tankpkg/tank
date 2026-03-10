import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TankApiClient } from '../lib/api-client.js';

export function registerWhoamiTool(server: McpServer): void {
  server.tool('whoami', 'Show the authenticated Tank user for the current local session.', {}, async () => {
    const client = new TankApiClient();

    if (!client.isAuthenticated) {
      return {
        content: [{ type: 'text' as const, text: 'Not logged in. Use the login tool to authenticate.' }]
      };
    }

    const authCheck = await client.verifyAuth();

    if (authCheck.valid) {
      const name = authCheck.user.name ?? 'unknown';
      const email = authCheck.user.email ?? 'unknown';
      return {
        content: [{ type: 'text' as const, text: `Logged in as ${name}\nEmail: ${email}` }]
      };
    }

    if (authCheck.reason === 'network-error') {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Failed to connect to the registry. Check your network connection.\nError: ${authCheck.error ?? 'unknown'}`
          }
        ],
        isError: true
      };
    }

    return {
      content: [{ type: 'text' as const, text: 'Session expired or invalid. Use the login tool to re-authenticate.' }]
    };
  });
}

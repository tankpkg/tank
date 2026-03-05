import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConfig, setConfig } from '../lib/config.js';

export function registerLogoutTool(server: McpServer): void {
  server.tool(
    'logout',
    'Log out of Tank by clearing local credentials.',
    {},
    async () => {

      const config = getConfig();

      if (!config.token) {
        return {
          content: [{ type: 'text' as const, text: 'Not logged in. No credentials to clear.' }],
        };
      }

      setConfig({ token: undefined, user: undefined });

      // Also clear env-based token so subsequent tool calls in this
      // process don't re-read it via getConfig().
      delete process.env.TANK_TOKEN;

      return {
        content: [{ type: 'text' as const, text: 'Successfully logged out.' }],
      };
    },
  );
}

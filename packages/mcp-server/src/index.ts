#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Import tools
import { registerLoginTool } from './tools/login.js';
import { registerSearchSkillsTool } from './tools/search-skills.js';
import { registerSkillInfoTool } from './tools/skill-info.js';
import { registerScanSkillTool } from './tools/scan-skill.js';
import { registerPublishSkillTool } from './tools/publish-skill.js';

// Create MCP server instance
const server = new McpServer({
  name: 'tank',
  version: '0.1.0',
});

// Register all tools
registerLoginTool(server);
registerSearchSkillsTool(server);
registerSkillInfoTool(server);
registerScanSkillTool(server);
registerPublishSkillTool(server);

// Start stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server error:', error);
  process.exit(1);
});

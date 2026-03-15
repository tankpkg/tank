#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerAuditSkillTool } from '~/tools/audit-skill.js';
import { registerDoctorTool } from '~/tools/doctor.js';
import { registerInitSkillTool } from '~/tools/init-skill.js';
import { registerInstallSkillTool } from '~/tools/install-skill.js';
import { registerLinkSkillTool } from '~/tools/link-skill.js';
// Import tools
import { registerLoginTool } from '~/tools/login.js';
import { registerLogoutTool } from '~/tools/logout.js';
import { registerPublishSkillTool } from '~/tools/publish-skill.js';
import { registerRemoveSkillTool } from '~/tools/remove-skill.js';
import { registerScanSkillTool } from '~/tools/scan-skill.js';
import { registerSearchSkillsTool } from '~/tools/search-skills.js';
import { registerSkillInfoTool } from '~/tools/skill-info.js';
import { registerSkillPermissionsTool } from '~/tools/skill-permissions.js';
import { registerUnlinkSkillTool } from '~/tools/unlink-skill.js';
import { registerUpdateSkillTool } from '~/tools/update-skill.js';
import { registerVerifySkillsTool } from '~/tools/verify-skills.js';
import { registerWhoamiTool } from '~/tools/whoami.js';

// Create MCP server instance
const server = new McpServer({
  name: 'tank',
  version: '0.1.0'
});

// Register all tools
registerLoginTool(server);
registerSearchSkillsTool(server);
registerSkillInfoTool(server);
registerScanSkillTool(server);
registerPublishSkillTool(server);
registerLogoutTool(server);
registerWhoamiTool(server);
registerInitSkillTool(server);
registerRemoveSkillTool(server);
registerVerifySkillsTool(server);
registerLinkSkillTool(server);
registerUnlinkSkillTool(server);
registerDoctorTool(server);
registerSkillPermissionsTool(server);
registerInstallSkillTool(server);
registerUpdateSkillTool(server);
registerAuditSkillTool(server);

// Start stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((_error) => {
  process.exit(1);
});

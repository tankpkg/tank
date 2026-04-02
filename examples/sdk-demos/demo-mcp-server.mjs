/**
 * MCP Server — exposes Tank skills as MCP tools
 * Any MCP client (Claude Desktop, Cursor, OpenCode) can connect and use them
 *
 * Run: node demo-mcp-server.mjs
 * Then connect from your MCP client via stdio
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { TankClient, createSkillTool } from '@tankpkg/sdk';

const REGISTRY = process.env.TANK_REGISTRY_URL || 'http://localhost:5555';
const SKILLS = (process.env.TANK_SKILLS || '@e2etest-019e8fc048/sdk-demo-skill').split(',');

async function main() {
  console.error('Tank MCP Server starting...');
  console.error(`Registry: ${REGISTRY}`);
  console.error(`Skills: ${SKILLS.join(', ')}`);

  const tank = new TankClient({ registryUrl: REGISTRY });
  const server = new McpServer({ name: 'tank-skills', version: '0.1.0' });

  // Dynamically register each skill as an MCP tool
  for (const skillName of SKILLS) {
    console.error(`Loading skill: ${skillName}`);
    const skillTool = await createSkillTool(tank, skillName.trim());

    server.tool(
      skillTool.name,
      skillTool.description,
      {
        action: z.enum(['read', 'list', 'read_all']).describe('read: single file. list: all files. read_all: complete skill.'),
        path: z.string().optional().describe('File path (required for read action)'),
      },
      async (args) => {
        const result = await skillTool.execute(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    console.error(`  ✅ Registered tool: ${skillTool.name} (${skillTool.files.length} files)`);
  }

  // Connect via stdio — MCP clients pipe JSON-RPC through stdin/stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`\nMCP server running — ${SKILLS.length} skill tool(s) registered`);
  console.error('Connect from Claude Desktop, Cursor, or OpenCode via stdio');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });

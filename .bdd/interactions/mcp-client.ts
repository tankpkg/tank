import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '../../packages/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../../packages/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MCP_SERVER_ENTRYPOINT = path.resolve(__dirname, '../../packages/mcp-server/dist/index.js');

export interface McpToolResult {
  content: string;
  isError?: boolean;
}

export class McpTestClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private started = false;

  async start(options: { home?: string; env?: Record<string, string> } = {}): Promise<void> {
    if (this.started) {
      return;
    }

    const mergedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') {
        mergedEnv[key] = value;
      }
    }

    if (options.home) {
      mergedEnv.HOME = options.home;
    }
    if (options.env) {
      Object.assign(mergedEnv, options.env);
    }

    this.transport = new StdioClientTransport({
      command: 'node',
      args: [MCP_SERVER_ENTRYPOINT],
      env: mergedEnv,
      stderr: 'pipe'
    });

    this.client = new Client(
      {
        name: 'tank-mcp-bdd-tests',
        version: '0.1.0'
      },
      {
        capabilities: {}
      }
    );

    await this.client.connect(this.transport);
    this.started = true;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    if (!this.client) {
      throw new Error('MCP client is not started');
    }

    const result = await this.client.callTool({
      name,
      arguments: args
    });

    return {
      content: this.contentToText(result.content),
      isError: typeof result.isError === 'boolean' ? result.isError : undefined
    };
  }

  async listTools(): Promise<string[]> {
    if (!this.client) {
      throw new Error('MCP client is not started');
    }

    const result = await this.client.listTools();
    return result.tools.map((tool) => tool.name);
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }

    this.client = null;
    this.transport = null;
    this.started = false;
  }

  private contentToText(content: unknown): string {
    if (!Array.isArray(content)) {
      return '';
    }

    const parts: string[] = [];

    for (const item of content) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const maybeText = (item as { text?: unknown }).text;
      if (typeof maybeText === 'string') {
        parts.push(maybeText);
      }
    }

    return parts.join('\n').trim();
  }
}

export function getMcpServerEntrypoint(): string {
  return MCP_SERVER_ENTRYPOINT;
}

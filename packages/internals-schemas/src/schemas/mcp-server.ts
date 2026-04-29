import { z } from 'zod';

const commandSchema = z.string().min(1, 'command must not be empty');
const argSchema = z.array(z.string()).default([]);
const envSchema = z.record(z.string(), z.string()).optional();
const remoteUrlSchema = z.string().url('remote must be a valid URL');

const localMcpServerSchema = z
  .object({
    command: commandSchema,
    args: argSchema,
    env: envSchema,
    requires_auth: z.literal(false).optional()
  })
  .strict();

const remoteMcpServerSchema = z
  .object({
    remote: remoteUrlSchema,
    requires_auth: z.boolean().default(false),
    env: envSchema
  })
  .strict();

export const mcpServerSchema = z.union([localMcpServerSchema, remoteMcpServerSchema]);

export type McpServerLocal = z.infer<typeof localMcpServerSchema>;
export type McpServerRemote = z.infer<typeof remoteMcpServerSchema>;
export type McpServer = z.infer<typeof mcpServerSchema>;

export function isRemoteMcpServer(server: McpServer): server is McpServerRemote {
  return 'remote' in server;
}

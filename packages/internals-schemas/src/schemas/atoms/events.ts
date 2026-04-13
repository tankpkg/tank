import { z } from 'zod';

export const hookEventSchema = z.enum([
  // ── Tool lifecycle ────────────────────────────────────────────────────────
  'pre-tool-use',
  'post-tool-use',

  // ── File operations ───────────────────────────────────────────────────────
  'pre-file-read',
  'post-file-read',
  'pre-file-write',
  'post-file-write',
  'file-edited',
  'file-watcher-updated',

  // ── Shell / command execution ─────────────────────────────────────────────
  'pre-command',
  'post-command',

  // ── MCP tool calls ────────────────────────────────────────────────────────
  'pre-mcp-tool-use',
  'post-mcp-tool-use',

  // ── Session lifecycle ─────────────────────────────────────────────────────
  'session-created',
  'session-updated',
  'session-idle',
  'session-error',
  'session-deleted',

  // ── Agent stop (blocking — can force agent to continue) ───────────────────
  'pre-stop',

  // ── Task lifecycle ────────────────────────────────────────────────────────
  'task-start',
  'task-resume',
  'task-complete',
  'task-cancel',

  // ── Conversation / prompt ─────────────────────────────────────────────────
  'pre-user-prompt',
  'post-response',
  'message-updated',
  'message-removed',

  // ── System prompt ─────────────────────────────────────────────────────────
  'system-prompt-transform',

  // ── Context management ────────────────────────────────────────────────────
  'pre-context-compact',
  'post-context-compact',

  // ── Permissions ───────────────────────────────────────────────────────────
  'permission-asked',
  'permission-replied',

  // ── IDE / LSP ─────────────────────────────────────────────────────────────
  'lsp-diagnostics',
  'lsp-updated',

  // ── Subagent lifecycle ────────────────────────────────────────────────────
  'subagent-start',
  'subagent-complete',
  'subagent-tool-use',

  // ── Environment ───────────────────────────────────────────────────────────
  'shell-env',

  // ── Workflow ──────────────────────────────────────────────────────────────
  'todo-updated',
  'installation-updated'
]);

export type HookEvent = z.infer<typeof hookEventSchema>;

export const HOOK_EVENTS = hookEventSchema.options;

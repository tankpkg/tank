import type { AdapterCapabilities, AtomIR, PlatformAdapter, PlatformOutput } from '@internals/schemas';

import { resolveMcpCommand } from './_mcp-resolution.js';

function emitInstruction(atom: AtomIR & { kind: 'instruction' }): PlatformOutput {
  return {
    files: [{ path: `.windsurf/rules/${slugify(atom.content)}.md`, content: `{file:${atom.content}}` }],
    warnings: []
  };
}

function emitHook(atom: AtomIR & { kind: 'hook' }): PlatformOutput {
  const eventMap: Record<string, string> = {
    'pre-tool-use': 'pre_mcp_tool_use',
    'post-tool-use': 'post_mcp_tool_use',
    'pre-file-read': 'pre_read_code',
    'post-file-read': 'post_read_code',
    'pre-file-write': 'pre_write_code',
    'post-file-write': 'post_write_code',
    'pre-command': 'pre_run_command',
    'post-command': 'post_run_command',
    'pre-user-prompt': 'pre_user_prompt',
    'post-response': 'post_cascade_response',
    'pre-stop': 'post_cascade_response',
    'pre-mcp-tool-use': 'pre_mcp_tool_use',
    'post-mcp-tool-use': 'post_mcp_tool_use'
  };

  const wsEvent = eventMap[atom.event];
  if (!wsEvent) {
    return {
      files: [],
      warnings: [
        { level: 'degraded', atomKind: 'hook', message: `Windsurf does not support event "${atom.event}" — skipped` }
      ]
    };
  }

  const name = atom.name ?? `hook-${atom.event}`;

  if (atom.handler.type === 'js') {
    const wrapper = `#!/usr/bin/env node\nimport { readFileSync } from "node:fs";\nconst input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));\nconst handler = await import("./${name}.handler.ts");\nawait handler.default(input);\n`;

    const hookConfig = {
      hooks: { [wsEvent]: [{ command: `node "$WORKSPACE_DIR/.windsurf/hooks/${name}.mjs"`, show_output: true }] }
    };

    return {
      files: [
        { path: `.windsurf/hooks/${name}.mjs`, content: wrapper },
        { path: '.windsurf/hooks.json', content: JSON.stringify(hookConfig, null, 2) }
      ],
      warnings: []
    };
  }

  const script = buildDslScript(atom.handler.actions);
  const hookConfig = {
    hooks: { [wsEvent]: [{ command: `bash "$WORKSPACE_DIR/.windsurf/hooks/${name}.sh"`, show_output: true }] }
  };

  return {
    files: [
      { path: `.windsurf/hooks/${name}.sh`, content: script },
      { path: '.windsurf/hooks.json', content: JSON.stringify(hookConfig, null, 2) }
    ],
    warnings: []
  };
}

function emitAgent(atom: AtomIR & { kind: 'agent' }): PlatformOutput {
  return {
    files: [],
    warnings: [
      {
        level: 'degraded',
        atomKind: 'agent',
        message: `Windsurf has 3 fixed modes (Code/Plan/Ask) — agent "${atom.name}" compiled as instruction rule`
      }
    ]
  };
}

function emitTool(atom: AtomIR & { kind: 'tool' }): PlatformOutput {
  const resolved = resolveMcpCommand(atom, 'windsurf');
  if (!resolved) {
    return {
      files: [],
      warnings: [{ level: 'skipped', atomKind: 'tool', message: `Tool "${atom.name}" has no MCP config` }]
    };
  }

  const config = {
    mcpServers: {
      [atom.name]: {
        command: resolved.command,
        args: resolved.args,
        ...(resolved.env ? { env: resolved.env } : {})
      }
    }
  };

  return {
    files: [{ path: '.windsurf/mcp.json', content: JSON.stringify(config, null, 2) }],
    warnings: []
  };
}

function emitRule(atom: AtomIR & { kind: 'rule' }): PlatformOutput {
  const content = `## Rule: ${atom.name ?? atom.event}\n\n- Policy: ${atom.policy}\n- Event: ${atom.event}\n${atom.match ? `- Match: ${atom.match}\n` : ''}- Reason: ${atom.reason ?? 'No reason specified'}\n`;

  return {
    files: [{ path: `.windsurf/rules/rule-${slugify(atom.name ?? atom.event)}.md`, content }],
    warnings: [
      { level: 'degraded', atomKind: 'rule', message: 'Windsurf rules are soft guidance — use hooks for enforcement' }
    ]
  };
}

function emitResource(atom: AtomIR & { kind: 'resource' }): PlatformOutput {
  return {
    files: [],
    warnings: [
      {
        level: 'degraded',
        atomKind: 'resource',
        message: `Windsurf uses RAG indexing — resource "${atom.name ?? atom.uri}" not directly registrable`
      }
    ]
  };
}

function emitPrompt(atom: AtomIR & { kind: 'prompt' }): PlatformOutput {
  return {
    files: [
      {
        path: `.windsurf/skills/${atom.name}/SKILL.md`,
        content: `# ${atom.name}\n\n${atom.description ?? ''}\n\n{file:${atom.template}}`
      }
    ],
    warnings: []
  };
}

function slugify(s: string): string {
  return s.replace(/^\.\//, '').replace(/[/.]/g, '-').replace(/-+/g, '-').replace(/-$/, '');
}

function buildDslScript(actions: Array<{ action: string; match?: string; reason?: string; value?: string }>): string {
  const checks = actions
    .filter((a) => a.action === 'block' && a.match)
    .map(
      (a) => `if echo "$INPUT" | grep -q '${a.match}'; then\n  echo "Blocked: ${a.reason ?? a.match}" >&2\n  exit 2\nfi`
    )
    .join('\n');

  return `#!/usr/bin/env bash\nset -euo pipefail\nINPUT=$(cat)\n${checks}\nexit 0\n`;
}

const capabilities: AdapterCapabilities = {
  instruction: 'full',
  hook: 'full',
  tool: 'full',
  agent: 'degraded',
  rule: 'degraded',
  resource: 'degraded',
  prompt: 'full'
};

export const windsurfAdapter: PlatformAdapter = {
  name: 'windsurf',
  supportedRange: '>=1.0.0',
  capabilities,
  compileAtom(atom: unknown): PlatformOutput {
    const a = atom as AtomIR;
    switch (a.kind) {
      case 'instruction':
        return emitInstruction(a);
      case 'hook':
        return emitHook(a);
      case 'agent':
        return emitAgent(a);
      case 'tool':
        return emitTool(a);
      case 'rule':
        return emitRule(a);
      case 'resource':
        return emitResource(a);
      case 'prompt':
        return emitPrompt(a);
      default:
        return { files: [], warnings: [{ level: 'skipped', atomKind: 'unknown', message: 'Unknown atom kind' }] };
    }
  }
};

import type { AdapterCapabilities, AtomIR, PlatformAdapter, PlatformOutput } from '@internals/schemas';

import { resolveMcpCommand } from './_mcp-resolution.js';

function emitInstruction(atom: AtomIR & { kind: 'instruction' }): PlatformOutput {
  const globs = atom.globs?.length ? atom.globs.join(', ') : undefined;
  const alwaysApply = !globs && atom.scope !== 'directory';

  const frontmatter = [
    '---',
    `description: Tank-generated instruction`,
    globs ? `globs: ${globs}` : null,
    `alwaysApply: ${alwaysApply}`,
    '---'
  ]
    .filter(Boolean)
    .join('\n');

  return {
    files: [
      { path: `.cursor/rules/${slugify(atom.content)}.mdc`, content: `${frontmatter}\n\n{file:${atom.content}}` }
    ],
    warnings: []
  };
}

function emitHook(atom: AtomIR & { kind: 'hook' }): PlatformOutput {
  const eventMap: Record<string, string> = {
    'pre-tool-use': 'beforeToolCall',
    'post-tool-use': 'afterToolCall',
    'pre-file-write': 'beforeFileEdit',
    'post-file-write': 'afterFileEdit',
    'pre-command': 'beforeCommand',
    'post-command': 'afterCommand',
    'pre-stop': 'afterResponse',
    'post-response': 'afterResponse',
    'pre-file-read': 'beforeTabFileRead',
    'pre-mcp-tool-use': 'beforeMcpToolCall',
    'post-mcp-tool-use': 'afterMcpToolCall'
  };

  const cursorEvent = eventMap[atom.event];
  if (!cursorEvent) {
    return {
      files: [],
      warnings: [
        {
          level: 'degraded',
          atomKind: 'hook',
          message: `Cursor does not have a direct equivalent for event "${atom.event}" — skipped`
        }
      ]
    };
  }

  const name = atom.name ?? `hook-${atom.event}`;
  const hookConfig: Record<string, unknown> = {};

  if (atom.handler.type === 'js') {
    hookConfig[cursorEvent] = [
      {
        type: 'command',
        command: `node "$PROJECT_DIR/.cursor/hooks/${name}.mjs"`
      }
    ];
  } else {
    const script = buildDslScript(atom.handler.actions);
    hookConfig[cursorEvent] = [
      {
        type: 'command',
        command: `bash "$PROJECT_DIR/.cursor/hooks/${name}.sh"`
      }
    ];

    return {
      files: [
        { path: `.cursor/hooks/${name}.sh`, content: script },
        { path: '.cursor/hooks.json', content: JSON.stringify({ hooks: hookConfig }, null, 2) }
      ],
      warnings: []
    };
  }

  const jsWrapper = `import { readFileSync } from "node:fs";\nconst input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));\nconst handler = await import("./${name}.handler.ts");\nawait handler.default(input);\n`;

  return {
    files: [
      { path: `.cursor/hooks/${name}.mjs`, content: jsWrapper },
      { path: '.cursor/hooks.json', content: JSON.stringify({ hooks: hookConfig }, null, 2) }
    ],
    warnings: []
  };
}

function emitAgent(atom: AtomIR & { kind: 'agent' }): PlatformOutput {
  const tools = atom.tools ?? [];
  const readonlyNote = atom.readonly ? '\n\nThis agent is read-only. Do not modify files.' : '';

  const md = `# ${atom.name}\n\n${atom.role}\n\nTools: ${tools.join(', ')}${readonlyNote}\n`;

  return {
    files: [{ path: `.cursor/agents/${atom.name}.md`, content: md }],
    warnings: []
  };
}

function emitTool(atom: AtomIR & { kind: 'tool' }): PlatformOutput {
  const resolved = resolveMcpCommand(atom, 'cursor');
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
    files: [{ path: '.cursor/mcp.json', content: JSON.stringify(config, null, 2) }],
    warnings: []
  };
}

function emitRule(atom: AtomIR & { kind: 'rule' }): PlatformOutput {
  const content = `# Rule: ${atom.name ?? atom.event}\n\n**Policy:** ${atom.policy}\n**Event:** ${atom.event}\n${atom.match ? `**Match:** ${atom.match}\n` : ''}${atom.reason ? `**Reason:** ${atom.reason}\n` : ''}`;

  return {
    files: [
      {
        path: `.cursor/rules/rule-${slugify(atom.name ?? atom.event)}.mdc`,
        content: `---\nalwaysApply: true\n---\n\n${content}`
      }
    ],
    warnings: [
      {
        level: 'degraded',
        atomKind: 'rule',
        message: 'Cursor rules are soft guidance — use hooks for hard enforcement'
      }
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
        message: `Cursor uses @Docs for resources — "${atom.name ?? atom.uri}" not directly registrable`
      }
    ]
  };
}

function emitPrompt(atom: AtomIR & { kind: 'prompt' }): PlatformOutput {
  return {
    files: [
      {
        path: `.cursor/skills/${atom.name}/SKILL.md`,
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
  agent: 'full',
  rule: 'degraded',
  resource: 'degraded',
  prompt: 'full'
};

export const cursorAdapter: PlatformAdapter = {
  name: 'cursor',
  supportedRange: '>=0.40.0',
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

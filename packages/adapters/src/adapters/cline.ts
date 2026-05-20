import type { AdapterCapabilities, AtomIR, PlatformAdapter, PlatformOutput } from '@internals/schemas';

import { resolveMcpCommand } from './_mcp-resolution.js';

function emitInstruction(atom: AtomIR & { kind: 'instruction' }): PlatformOutput {
  return {
    files: [{ path: `.clinerules/${slugify(atom.content)}.md`, content: `{file:${atom.content}}` }],
    warnings: []
  };
}

function emitHook(atom: AtomIR & { kind: 'hook' }): PlatformOutput {
  const eventMap: Record<string, string> = {
    'pre-tool-use': 'PreToolUse',
    'post-tool-use': 'PostToolUse',
    'task-start': 'TaskStart',
    'task-resume': 'TaskResume',
    'task-complete': 'TaskComplete',
    'task-cancel': 'TaskCancel',
    'pre-user-prompt': 'UserPromptSubmit',
    'pre-context-compact': 'PreCompact',
    'pre-stop': 'TaskComplete'
  };

  const clineEvent = eventMap[atom.event];
  if (!clineEvent) {
    return {
      files: [],
      warnings: [
        { level: 'degraded', atomKind: 'hook', message: `Cline does not support event "${atom.event}" — skipped` }
      ]
    };
  }

  const name = atom.name ?? `hook-${atom.event}`;

  if (atom.handler.type === 'js') {
    const wrapper = `#!/usr/bin/env node\nimport { readFileSync } from "node:fs";\nconst input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));\nconst handler = await import("./${name}.handler.ts");\nconst result = await handler.default(input);\nif (result) process.stdout.write(JSON.stringify(result));\n`;

    return {
      files: [{ path: `.clinerules/hooks/${name}.mjs`, content: wrapper }],
      warnings: []
    };
  }

  const script = buildDslScript(atom.handler.actions);
  return {
    files: [{ path: `.clinerules/hooks/${name}.sh`, content: script }],
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
        message: `Cline only has Plan/Act modes — agent "${atom.name}" compiled as instruction`
      }
    ]
  };
}

function emitTool(atom: AtomIR & { kind: 'tool' }): PlatformOutput {
  const resolved = resolveMcpCommand(atom, 'cline');
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
        disabled: false,
        ...(resolved.env ? { env: resolved.env } : {})
      }
    }
  };

  return {
    files: [{ path: '.vscode/cline_mcp_settings.json', content: JSON.stringify(config, null, 2) }],
    warnings: []
  };
}

function emitRule(atom: AtomIR & { kind: 'rule' }): PlatformOutput {
  const content = `## Rule: ${atom.name ?? atom.event}\n\n- Policy: ${atom.policy}\n- Reason: ${atom.reason ?? 'No reason specified'}\n`;

  return {
    files: [{ path: `.clinerules/rule-${slugify(atom.name ?? atom.event)}.md`, content }],
    warnings: [
      { level: 'degraded', atomKind: 'rule', message: 'Cline rules are soft guidance — use hooks for enforcement' }
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
        message: `Cline MCP resources supported — "${atom.name ?? atom.uri}" requires MCP server registration`
      }
    ]
  };
}

function emitPrompt(atom: AtomIR & { kind: 'prompt' }): PlatformOutput {
  return {
    files: [
      {
        path: `.clinerules/skills/${atom.name}/SKILL.md`,
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
      (a) =>
        `if echo "$INPUT" | grep -q '${a.match}'; then\n  echo '{"cancel":true,"reason":"${a.reason ?? a.match}"}'\n  exit 0\nfi`
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

export const clineAdapter: PlatformAdapter = {
  name: 'cline',
  supportedRange: '>=3.0.0',
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

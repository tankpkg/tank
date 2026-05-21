import type { AdapterCapabilities, AtomIR, PlatformAdapter, PlatformOutput } from '@internals/schemas';

import { resolveMcpCommand } from './_mcp-resolution.js';

function emitInstruction(atom: AtomIR & { kind: 'instruction' }): PlatformOutput {
  return {
    files: [
      {
        path: `.opencode/instructions/${slugify(atom.content)}.md`,
        content: `{file:${atom.content}}`
      }
    ],
    warnings: []
  };
}

function emitHook(atom: AtomIR & { kind: 'hook' }): PlatformOutput {
  const TRIGGER_HOOKS: Record<string, string> = {
    'pre-tool-use': 'tool.execute.before',
    'post-tool-use': 'tool.execute.after',
    'pre-file-read': 'tool.execute.before',
    'post-file-read': 'tool.execute.after',
    'pre-file-write': 'tool.execute.before',
    'post-file-write': 'tool.execute.after',
    'pre-command': 'tool.execute.before',
    'post-command': 'tool.execute.after',
    'pre-context-compact': 'experimental.session.compacting',
    'system-prompt-transform': 'experimental.chat.system.transform'
  };

  const EVENT_MAP: Record<string, string> = {
    'pre-stop': 'session.idle',
    'session-created': 'session.created',
    'session-idle': 'session.idle',
    'session-error': 'session.error',
    'file-edited': 'file.edited',
    'file-watcher-updated': 'file.watcher.updated',
    'task-start': 'session.created',
    'task-complete': 'session.idle',
    'todo-updated': 'todo.updated',
    'permission-asked': 'permission.asked',
    'permission-replied': 'permission.replied',
    'post-response': 'session.idle',
    'pre-user-prompt': 'message.updated',
    'message-updated': 'message.updated',
    'lsp-diagnostics': 'lsp.client.diagnostics',
    'lsp-updated': 'lsp.updated',
    'subagent-start': 'session.created',
    'subagent-complete': 'session.idle',
    'installation-updated': 'installation.updated',
    'shell-env': 'shell.env',
    'pre-mcp-tool-use': 'tool.execute.before',
    'post-mcp-tool-use': 'tool.execute.after'
  };

  const name = atom.name ?? `hook-${atom.event}`;
  const triggerHook = TRIGGER_HOOKS[atom.event];

  if (triggerHook) {
    const pluginContent =
      atom.handler.type === 'js'
        ? buildJsTriggerPlugin(name, triggerHook, atom)
        : buildDslTriggerPlugin(name, triggerHook, atom);
    return {
      files: [{ path: `.opencode/plugins/${name}.ts`, content: pluginContent }],
      warnings: []
    };
  }

  const busEvent = EVENT_MAP[atom.event] ?? atom.event.replace(/-/g, '.');
  const pluginContent =
    atom.handler.type === 'js' ? buildJsEventPlugin(name, busEvent, atom) : buildDslEventPlugin(name, busEvent, atom);
  return {
    files: [{ path: `.opencode/plugins/${name}.ts`, content: pluginContent }],
    warnings: []
  };
}

function emitAgent(atom: AtomIR & { kind: 'agent' }): PlatformOutput {
  const READ_ONLY_TOOLS = new Set(['read', 'grep', 'glob', 'lsp', 'fetch', 'mcp']);
  const permissions: Record<string, boolean> = {};
  for (const tool of atom.tools ?? []) {
    permissions[tool] = atom.readonly ? READ_ONLY_TOOLS.has(tool) : true;
  }

  const md = [
    `---`,
    `description: "${atom.role}"`,
    `mode: subagent`,
    atom.model && !['fast', 'balanced', 'powerful', 'custom'].includes(atom.model) ? `model: ${atom.model}` : null,
    `permissions:`,
    ...Object.entries(permissions).map(([k, v]) => `  ${k}: ${v}`),
    atom.readonly ? `  write: false\n  edit: false\n  bash: false` : null,
    `---`,
    '',
    atom.role
  ]
    .filter(Boolean)
    .join('\n');

  return {
    files: [{ path: `.opencode/agent/${atom.name}.md`, content: md }],
    warnings: []
  };
}

function emitTool(atom: AtomIR & { kind: 'tool' }): PlatformOutput {
  const resolved = resolveMcpCommand(atom, 'opencode');
  if (!resolved) {
    return {
      files: [],
      warnings: [
        {
          level: 'skipped',
          atomKind: 'tool',
          message: `Tool "${atom.name}" has no MCP config — cannot register in OpenCode`
        }
      ]
    };
  }

  const config = {
    [atom.name]: {
      type: 'local' as const,
      command: [resolved.command, ...resolved.args],
      ...(resolved.env ? { environment: resolved.env } : {})
    }
  };

  return {
    files: [{ path: `.opencode/mcp/${atom.name}.json`, content: JSON.stringify(config, null, 2) }],
    warnings: []
  };
}

function emitRule(atom: AtomIR & { kind: 'rule' }): PlatformOutput {
  const name = atom.name ?? `rule-${atom.event}`;
  const pluginContent = buildRulePlugin(name, atom);
  return {
    files: [{ path: `.opencode/plugins/${name}.ts`, content: pluginContent }],
    warnings: []
  };
}

function emitResource(atom: AtomIR & { kind: 'resource' }): PlatformOutput {
  return {
    files: [],
    warnings: [
      {
        level: 'degraded',
        atomKind: 'resource',
        message: `OpenCode MCP resources are experimental — resource "${atom.name ?? atom.uri}" registered as instruction reference`
      }
    ]
  };
}

function emitPrompt(atom: AtomIR & { kind: 'prompt' }): PlatformOutput {
  const frontmatter = [
    '---',
    `description: "${atom.description ?? atom.name}"`,
    '---',
    '',
    `{file:${atom.template}}`
  ].join('\n');

  return {
    files: [{ path: `.opencode/commands/${atom.name}.md`, content: frontmatter }],
    warnings: []
  };
}

function slugify(s: string): string {
  return s.replace(/^\.\//, '').replace(/[/.]/g, '-').replace(/-+/g, '-').replace(/-$/, '');
}

function buildJsTriggerPlugin(name: string, hook: string, atom: AtomIR & { kind: 'hook' }): string {
  const matchFilter = atom.match ? `\n      if (input.tool !== "${atom.match}") return;` : '';
  const handlerRelPath = `./handlers/${name}.handler`;

  return `import type { Plugin } from "@opencode-ai/plugin";

export const ${pascalCase(name)}: Plugin = async ({ client }) => {
  return {
    "${hook}": async (input, output) => {${matchFilter}
      const handler = await import("${handlerRelPath}");
      await handler.default(input, output, client);
    },
  };
};
`;
}

function buildDslTriggerPlugin(name: string, hook: string, atom: AtomIR & { kind: 'hook' }): string {
  if (atom.handler.type !== 'dsl') return '';

  const checks = atom.handler.actions
    .map((a) => {
      if (a.action === 'block' && a.match) {
        return `      if (JSON.stringify(output.args ?? input).includes("${a.match}")) {
        throw new Error("${a.reason ?? `Blocked: ${a.match}`}");
      }`;
      }
      if (a.action === 'injectContext' && a.value) {
        return `      output.system?.push?.("${a.value}");`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

  return `import type { Plugin } from "@opencode-ai/plugin";

export const ${pascalCase(name)}: Plugin = async () => {
  return {
    "${hook}": async (input, output) => {
${checks}
    },
  };
};
`;
}

function buildJsEventPlugin(name: string, busEvent: string, _atom: AtomIR & { kind: 'hook' }): string {
  const handlerRelPath = `./handlers/${name}.handler`;

  return `import type { Plugin } from "@opencode-ai/plugin";

export const ${pascalCase(name)}: Plugin = async ({ client, $ }) => {
  let _lastFingerprint = "";
  let _running = false;
  return {
    event: ({ event }) => {
      const e = event;
      if (e.type !== "${busEvent}") return;
      if (_running) return;
      const sid = e.properties?.sessionID ?? "";
      if (!sid) return;
      _running = true;
      $\`git status --porcelain -uall 2>/dev/null\`.text().then((stat) => {
        const fp = stat.trim();
        if (!fp || fp === _lastFingerprint) {
          _running = false;
          return;
        }
        _lastFingerprint = fp;
        return import("${handlerRelPath}").then((handler) => {
          return handler.default(e, { client, $ });
        });
      }).catch((err) => console.error("[${name}] ERROR:", err)).finally(() => { _running = false; });
    },
  };
};
`;
}

function buildDslEventPlugin(name: string, busEvent: string, atom: AtomIR & { kind: 'hook' }): string {
  if (atom.handler.type !== 'dsl') return '';

  const checks = atom.handler.actions
    .map((a) => {
      if (a.action === 'block' && a.match) {
        return `      console.error("[${name}] Blocked: ${a.reason ?? a.match}");`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

  return `import type { Plugin } from "@opencode-ai/plugin";

export const ${pascalCase(name)}: Plugin = async () => {
  return {
    event: ({ event }) => {
      if (event.type !== "${busEvent}") return;
${checks}
    },
  };
};
`;
}

function buildRulePlugin(name: string, atom: AtomIR & { kind: 'rule' }): string {
  const triggerMap: Record<string, string> = {
    'pre-tool-use': 'tool.execute.before',
    'post-tool-use': 'tool.execute.after'
  };

  const triggerHook = triggerMap[atom.event];
  const matchFilter = atom.match ? `\n      if (input.tool !== "${atom.match}") return;` : '';

  if (triggerHook) {
    if (atom.policy === 'block') {
      return `import type { Plugin } from "@opencode-ai/plugin";

export const ${pascalCase(name)}: Plugin = async () => {
  return {
    "${triggerHook}": async (input, output) => {${matchFilter}
      throw new Error("${atom.reason ?? 'Blocked by rule'}");
    },
  };
};
`;
    }

    return `import type { Plugin } from "@opencode-ai/plugin";

export const ${pascalCase(name)}: Plugin = async () => {
  return {
    "${triggerHook}": async (input, output) => {${matchFilter}
      console.warn("[${name}] ${atom.reason ?? 'Rule triggered'}");
    },
  };
};
`;
  }

  return `import type { Plugin } from "@opencode-ai/plugin";

export const ${pascalCase(name)}: Plugin = async () => {
  return {
    event: ({ event }) => {
      if (event.type !== "${atom.event.replace(/-/g, '.')}") return;
      console.${atom.policy === 'block' ? 'error' : 'warn'}("[${name}] ${atom.reason ?? 'Rule triggered'}");
    },
  };
};
`;
}

function pascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

const capabilities: AdapterCapabilities = {
  instruction: 'full',
  hook: 'full',
  tool: 'full',
  agent: 'full',
  rule: 'full',
  resource: 'degraded',
  prompt: 'full'
};

export const opencodeAdapter: PlatformAdapter = {
  name: 'opencode',
  supportedRange: '>=0.1.0',
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

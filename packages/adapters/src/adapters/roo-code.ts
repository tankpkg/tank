import type { AdapterCapabilities, AtomIR, PlatformAdapter, PlatformOutput } from '@internals/schemas';

function emitInstruction(atom: AtomIR & { kind: 'instruction' }): PlatformOutput {
  return {
    files: [{ path: `.roo/rules/${slugify(atom.content)}.md`, content: `{file:${atom.content}}` }],
    warnings: []
  };
}

function emitHook(_atom: AtomIR & { kind: 'hook' }): PlatformOutput {
  return {
    files: [],
    warnings: [{ level: 'skipped', atomKind: 'hook', message: 'Roo Code does not support hooks' }]
  };
}

function emitAgent(atom: AtomIR & { kind: 'agent' }): PlatformOutput {
  const toolGroups: string[] = [];
  for (const tool of atom.tools ?? []) {
    if (['read', 'grep', 'glob'].includes(tool)) toolGroups.push('read');
    if (['write', 'edit'].includes(tool)) toolGroups.push('edit');
    if (['bash'].includes(tool)) toolGroups.push('command');
    if (['browser'].includes(tool)) toolGroups.push('browser');
    if (['mcp'].includes(tool)) toolGroups.push('mcp');
  }
  const uniqueGroups = [...new Set(toolGroups)];

  const groups = uniqueGroups
    .map((g) => {
      if (g === 'edit' && atom.readonly) return null;
      if (g === 'command' && atom.readonly) return null;
      return g;
    })
    .filter(Boolean);

  const mode = {
    slug: atom.name,
    name: atom.name.charAt(0).toUpperCase() + atom.name.slice(1),
    roleDefinition: atom.role,
    groups: groups.map((g) => [g, {}]),
    customInstructions: atom.readonly ? 'This mode is read-only. Do not modify any files.' : undefined
  };

  return {
    files: [{ path: `.roomodes`, content: JSON.stringify({ customModes: [mode] }, null, 2) }],
    warnings: []
  };
}

function emitTool(atom: AtomIR & { kind: 'tool' }): PlatformOutput {
  if (!atom.mcp) {
    return {
      files: [],
      warnings: [{ level: 'skipped', atomKind: 'tool', message: `Tool "${atom.name}" has no MCP config` }]
    };
  }

  const config = {
    mcpServers: {
      [atom.name]: {
        command: atom.mcp.command,
        args: atom.mcp.args ?? [],
        disabled: false,
        ...(atom.mcp.env ? { env: atom.mcp.env } : {})
      }
    }
  };

  return {
    files: [{ path: '.vscode/mcp.json', content: JSON.stringify(config, null, 2) }],
    warnings: []
  };
}

function emitRule(atom: AtomIR & { kind: 'rule' }): PlatformOutput {
  const content = `## Rule: ${atom.name ?? atom.event}\n\n- Policy: ${atom.policy}\n- Reason: ${atom.reason ?? 'No reason specified'}\n`;

  return {
    files: [{ path: `.roo/rules/rule-${slugify(atom.name ?? atom.event)}.md`, content }],
    warnings: [{ level: 'degraded', atomKind: 'rule', message: 'Roo Code rules are soft guidance only' }]
  };
}

function emitResource(atom: AtomIR & { kind: 'resource' }): PlatformOutput {
  return {
    files: [],
    warnings: [
      {
        level: 'degraded',
        atomKind: 'resource',
        message: `Roo Code MCP resources are mode-scoped — "${atom.name ?? atom.uri}" requires manual MCP setup`
      }
    ]
  };
}

function emitPrompt(atom: AtomIR & { kind: 'prompt' }): PlatformOutput {
  return {
    files: [],
    warnings: [
      {
        level: 'degraded',
        atomKind: 'prompt',
        message: `Roo Code does not support custom slash commands — prompt "${atom.name}" skipped`
      }
    ]
  };
}

function slugify(s: string): string {
  return s.replace(/^\.\//, '').replace(/[/.]/g, '-').replace(/-+/g, '-').replace(/-$/, '');
}

const capabilities: AdapterCapabilities = {
  instruction: 'full',
  hook: 'none',
  tool: 'full',
  agent: 'full',
  rule: 'degraded',
  resource: 'degraded',
  prompt: 'degraded'
};

export const rooCodeAdapter: PlatformAdapter = {
  name: 'roo-code',
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

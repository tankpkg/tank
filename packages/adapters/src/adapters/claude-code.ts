import type { AdapterCapabilities, AtomIR, PlatformAdapter, PlatformOutput } from '@internals/schemas';

function emitInstruction(atom: AtomIR & { kind: 'instruction' }): PlatformOutput {
  const globs = atom.globs?.length ? atom.globs : undefined;

  if (globs) {
    const frontmatter = `---\nglobs: ${JSON.stringify(globs)}\n---\n`;
    return {
      files: [{ path: `.claude/rules/${slugify(atom.content)}.md`, content: `${frontmatter}\n{file:${atom.content}}` }],
      warnings: []
    };
  }

  return {
    files: [{ path: `.claude/rules/${slugify(atom.content)}.md`, content: `{file:${atom.content}}` }],
    warnings: []
  };
}

function emitHook(atom: AtomIR & { kind: 'hook' }): PlatformOutput {
  const eventMap: Record<string, string> = {
    'pre-tool-use': 'PreToolUse',
    'post-tool-use': 'PostToolUse',
    'pre-stop': 'Stop',
    'session-created': 'SessionStart',
    'session-idle': 'Notification',
    'task-start': 'SessionStart',
    'task-complete': 'TaskCompleted',
    'task-cancel': 'SessionEnd',
    'pre-user-prompt': 'UserPromptSubmit',
    'pre-context-compact': 'PreCompact',
    'post-context-compact': 'PostCompact',
    'post-response': 'Notification',
    'subagent-start': 'SubagentStart',
    'subagent-complete': 'SubagentStop',
    'permission-asked': 'PermissionRequest',
    'permission-replied': 'PermissionDenied',
    'file-edited': 'FileChanged',
    'pre-file-read': 'PreToolUse',
    'post-file-read': 'PostToolUse',
    'pre-file-write': 'PreToolUse',
    'post-file-write': 'PostToolUse',
    'pre-command': 'PreToolUse',
    'post-command': 'PostToolUse',
    'pre-mcp-tool-use': 'PreToolUse',
    'post-mcp-tool-use': 'PostToolUse',
    'system-prompt-transform': 'InstructionsLoaded',
    'message-updated': 'Notification',
    'lsp-diagnostics': 'Notification'
  };

  const ccEvent = eventMap[atom.event] ?? 'Notification';
  const name = atom.name ?? `hook-${atom.event}`;

  const matcher = atom.match ?? undefined;

  const hookEntry: Record<string, unknown> = { type: 'command' };

  if (atom.handler.type === 'js') {
    hookEntry.command = `node "$CLAUDE_PROJECT_DIR/.claude/hooks/${name}.mjs"`;
  } else {
    const actions = atom.handler.actions;
    const script = buildDslShellScript(name, actions);
    hookEntry.command = `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/${name}.sh"`;

    const files: { path: string; content: string }[] = [{ path: `.claude/hooks/${name}.sh`, content: script }];

    const settingsFragment = buildSettingsFragment(ccEvent, matcher, hookEntry);

    files.push({
      path: `.claude/settings.json`,
      content: JSON.stringify({ hooks: settingsFragment }, null, 2)
    });

    return { files, warnings: [] };
  }

  const jsWrapper = buildJsWrapper(name, atom);
  const settingsFragment = buildSettingsFragment(ccEvent, matcher, hookEntry);

  return {
    files: [
      { path: `.claude/hooks/${name}.mjs`, content: jsWrapper },
      { path: `.claude/settings.json`, content: JSON.stringify({ hooks: settingsFragment }, null, 2) }
    ],
    warnings: []
  };
}

function emitAgent(atom: AtomIR & { kind: 'agent' }): PlatformOutput {
  const tools = atom.tools ?? [];
  const toolsSection = tools.length ? `\n## Tools\n\n${tools.map((t) => `- ${t}`).join('\n')}` : '';
  const readonlySection = atom.readonly ? '\n\n## Permissions\n\nThis agent is read-only. Do not modify files.' : '';

  const md = `# ${atom.name}\n\n${atom.role}${toolsSection}${readonlySection}\n`;

  return {
    files: [{ path: `.claude/agents/${atom.name}.md`, content: md }],
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

  const mcpConfig = {
    mcpServers: {
      [atom.name]: {
        command: atom.mcp.command,
        args: atom.mcp.args ?? [],
        ...(atom.mcp.env ? { env: atom.mcp.env } : {})
      }
    }
  };

  return {
    files: [{ path: '.mcp.json', content: JSON.stringify(mcpConfig, null, 2) }],
    warnings: []
  };
}

function emitRule(atom: AtomIR & { kind: 'rule' }): PlatformOutput {
  const ccEvent = atom.event === 'pre-tool-use' ? 'PreToolUse' : atom.event === 'pre-stop' ? 'Stop' : 'PreToolUse';

  if (atom.policy === 'block') {
    const denyPattern = atom.match ? `Bash(${atom.match}*)` : undefined;
    if (denyPattern) {
      return {
        files: [
          {
            path: '.claude/settings.json',
            content: JSON.stringify(
              {
                permissions: { deny: [denyPattern] }
              },
              null,
              2
            )
          }
        ],
        warnings: []
      };
    }
  }

  const hookEntry = {
    type: 'command' as const,
    command: `echo '${atom.reason ?? 'Rule triggered'}' >&2 && exit ${atom.policy === 'block' ? '2' : '0'}`
  };

  const settingsFragment = buildSettingsFragment(ccEvent, atom.match ?? undefined, hookEntry);
  return {
    files: [{ path: '.claude/settings.json', content: JSON.stringify({ hooks: settingsFragment }, null, 2) }],
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
        message: `Claude Code uses CLAUDE.md @import for resources — "${atom.name ?? atom.uri}" registered as instruction`
      }
    ]
  };
}

function emitPrompt(atom: AtomIR & { kind: 'prompt' }): PlatformOutput {
  const md = atom.description ? `${atom.description}\n\n{file:${atom.template}}` : `{file:${atom.template}}`;

  return {
    files: [{ path: `.claude/commands/${atom.name}.md`, content: md }],
    warnings: []
  };
}

function slugify(s: string): string {
  return s.replace(/^\.\//, '').replace(/[/.]/g, '-').replace(/-+/g, '-').replace(/-$/, '');
}

function buildSettingsFragment(
  event: string,
  matcher: string | undefined,
  hookEntry: Record<string, unknown>
): Record<string, unknown[]> {
  return {
    [event]: [
      {
        ...(matcher ? { matcher } : {}),
        hooks: [hookEntry]
      }
    ]
  };
}

function buildDslShellScript(
  name: string,
  actions: Array<{ action: string; match?: string; reason?: string; value?: string }>
): string {
  const checks = actions
    .map((a) => {
      if (a.action === 'block' && a.match) {
        return `if echo "$INPUT" | grep -q '${a.match}'; then
  echo '{"decision":"block","reason":"${a.reason ?? `Blocked: ${a.match}`}"}' 
  exit 2
fi`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

  return `#!/usr/bin/env bash
set -euo pipefail
INPUT=$(cat)
${checks}
exit 0
`;
}

function buildJsWrapper(name: string, _atom: AtomIR & { kind: 'hook' }): string {
  return `import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));

const CODE_EXTS = new Set([".ts",".tsx",".js",".jsx",".py",".go",".rs",".java",".rb",".c",".cpp",".h",".cs",".swift",".kt",".sh"]);
const EXCLUDED = [".opencode/",".cursor/",".claude/",".windsurf/",".clinerules/",".roo/","node_modules/",".git/"];

function getChangedCodeFiles() {
  try {
    const status = execSync("git status --porcelain -uall 2>/dev/null", { encoding: "utf-8" }).trim();
    if (!status) return [];
    const files = status.split("\\n").map(l => l.slice(3).trim()).filter(Boolean);
    return files.filter(f => {
      if (EXCLUDED.some(e => f.startsWith(e))) return false;
      const ext = f.slice(f.lastIndexOf("."));
      return CODE_EXTS.has(ext);
    });
  } catch { return []; }
}

const codeFiles = getChangedCodeFiles();
if (codeFiles.length === 0) process.exit(0);

const reason = "Quality gate: " + codeFiles.length + " code file(s) modified (" + codeFiles.join(", ") + "). Review for critical/high issues before completing.";
process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
`;
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

export const claudeCodeAdapter: PlatformAdapter = {
  name: 'claude-code',
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

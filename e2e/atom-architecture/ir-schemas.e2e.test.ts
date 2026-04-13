import {
  agentIRSchema,
  atomIRSchema,
  hookIRSchema,
  instructionIRSchema,
  packageIRSchema,
  promptIRSchema,
  resourceIRSchema,
  ruleIRSchema,
  toolIRSchema
} from '@internals/schemas';
import { describe, expect, it } from 'vitest';

describe('E2E: Atom IR schemas — real Zod validation, zero mocks', () => {
  describe('InstructionIR', () => {
    it('accepts valid instruction with all fields', () => {
      const result = instructionIRSchema.safeParse({
        kind: 'instruction',
        content: './rules/typescript.md',
        scope: 'project',
        globs: ['**/*.ts', '**/*.tsx'],
        extensions: { cursor: { alwaysApply: true }, windsurf: { trigger: 'glob' } }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe('./rules/typescript.md');
        expect(result.data.scope).toBe('project');
        expect(result.data.globs).toEqual(['**/*.ts', '**/*.tsx']);
        expect(result.data.extensions).toHaveProperty('cursor');
        expect(result.data.extensions).toHaveProperty('windsurf');
      }
    });

    it('accepts minimal instruction (only required fields)', () => {
      const result = instructionIRSchema.safeParse({ kind: 'instruction', content: './SKILL.md' });
      expect(result.success).toBe(true);
    });

    it('rejects instruction with empty content', () => {
      const result = instructionIRSchema.safeParse({ kind: 'instruction', content: '' });
      expect(result.success).toBe(false);
    });

    it('rejects instruction missing content', () => {
      const result = instructionIRSchema.safeParse({ kind: 'instruction' });
      expect(result.success).toBe(false);
    });

    it('rejects instruction with unknown core field (strict mode)', () => {
      const result = instructionIRSchema.safeParse({
        kind: 'instruction',
        content: './rules.md',
        alwaysApply: true
      });
      expect(result.success).toBe(false);
    });

    it('preserves arbitrary extension values without validation', () => {
      const result = instructionIRSchema.safeParse({
        kind: 'instruction',
        content: './rules.md',
        extensions: {
          cursor: { alwaysApply: true, frontmatter: { trigger: 'glob' } },
          opencode: { scope: 'global', priority: 99 },
          customPlatform: [1, 2, 3]
        }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.extensions?.['customPlatform']).toEqual([1, 2, 3]);
      }
    });
  });

  describe('HookIR', () => {
    it('accepts DSL handler with multiple actions', () => {
      const result = hookIRSchema.safeParse({
        kind: 'hook',
        name: 'security-guard',
        event: 'pre-tool-use',
        match: 'bash',
        handler: {
          type: 'dsl',
          actions: [
            { action: 'block', match: 'rm -rf', reason: 'Destructive command' },
            { action: 'block', match: 'DROP TABLE', reason: 'SQL injection risk' },
            { action: 'injectContext', value: 'Always review destructive commands' }
          ]
        },
        scope: 'project'
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.handler.type).toBe('dsl');
        if (result.data.handler.type === 'dsl') {
          expect(result.data.handler.actions).toHaveLength(3);
          expect(result.data.handler.actions[0].action).toBe('block');
          expect(result.data.handler.actions[2].action).toBe('injectContext');
        }
      }
    });

    it('accepts JS handler with entry path', () => {
      const result = hookIRSchema.safeParse({
        kind: 'hook',
        event: 'post-tool-use',
        handler: { type: 'js', entry: './hooks/log-tool-calls.ts' }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.handler.type).toBe('js');
        if (result.data.handler.type === 'js') {
          expect(result.data.handler.entry).toBe('./hooks/log-tool-calls.ts');
        }
      }
    });

    it('rejects DSL handler with empty actions array', () => {
      const result = hookIRSchema.safeParse({
        kind: 'hook',
        event: 'pre-tool-use',
        handler: { type: 'dsl', actions: [] }
      });
      expect(result.success).toBe(false);
    });

    it('rejects JS handler with empty entry', () => {
      const result = hookIRSchema.safeParse({
        kind: 'hook',
        event: 'pre-tool-use',
        handler: { type: 'js', entry: '' }
      });
      expect(result.success).toBe(false);
    });

    it('rejects handler with invalid type discriminator', () => {
      const result = hookIRSchema.safeParse({
        kind: 'hook',
        event: 'pre-tool-use',
        handler: { type: 'python', script: 'hook.py' }
      });
      expect(result.success).toBe(false);
    });

    it('rejects hook with empty event', () => {
      const result = hookIRSchema.safeParse({
        kind: 'hook',
        event: '',
        handler: { type: 'dsl', actions: [{ action: 'block' }] }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AgentIR', () => {
    it('accepts full agent definition', () => {
      const result = agentIRSchema.safeParse({
        kind: 'agent',
        name: 'security-auditor',
        role: 'Security specialist for auth, payments, and sensitive data handling',
        tools: ['read', 'grep', 'glob', 'lsp'],
        model: 'fast',
        readonly: true,
        extensions: { 'claude-code': { permissionMode: 'plan' } }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('security-auditor');
        expect(result.data.tools).toHaveLength(4);
        expect(result.data.readonly).toBe(true);
      }
    });

    it('rejects agent with empty name', () => {
      const result = agentIRSchema.safeParse({ kind: 'agent', name: '', role: 'Code reviewer' });
      expect(result.success).toBe(false);
    });

    it('rejects agent with empty role', () => {
      const result = agentIRSchema.safeParse({ kind: 'agent', name: 'reviewer', role: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('ToolIR', () => {
    it('accepts tool with full MCP config', () => {
      const result = toolIRSchema.safeParse({
        kind: 'tool',
        name: 'github',
        description: 'GitHub API via MCP',
        mcp: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: '${env:GH_TOKEN}' }
        }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mcp?.command).toBe('npx');
        expect(result.data.mcp?.env?.['GITHUB_TOKEN']).toBe('${env:GH_TOKEN}');
      }
    });

    it('accepts tool without MCP (standalone)', () => {
      const result = toolIRSchema.safeParse({
        kind: 'tool',
        name: 'custom-calculator',
        description: 'Performs math operations'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('RuleIR', () => {
    it('accepts all three policies', () => {
      for (const policy of ['block', 'allow', 'warn'] as const) {
        const result = ruleIRSchema.safeParse({
          kind: 'rule',
          event: 'pre-tool-use',
          match: 'bash',
          policy,
          reason: `Policy is ${policy}`
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects unknown policy value', () => {
      const result = ruleIRSchema.safeParse({
        kind: 'rule',
        event: 'pre-tool-use',
        policy: 'deny'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ResourceIR', () => {
    it('accepts resource with all optional fields', () => {
      const result = resourceIRSchema.safeParse({
        kind: 'resource',
        name: 'api-docs',
        uri: 'docs://api-reference/v2',
        description: 'REST API documentation for v2',
        mimeType: 'text/markdown'
      });
      expect(result.success).toBe(true);
    });

    it('rejects resource with empty URI', () => {
      const result = resourceIRSchema.safeParse({
        kind: 'resource',
        uri: '',
        description: 'Empty URI'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PromptIR', () => {
    it('accepts prompt with arguments', () => {
      const result = promptIRSchema.safeParse({
        kind: 'prompt',
        name: 'deploy',
        description: 'Deploy to production with safety checks',
        template: './prompts/deploy.md',
        arguments: [
          { name: 'environment', description: 'Target env', required: true },
          { name: 'dry-run', description: 'Simulate only' }
        ]
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.arguments).toHaveLength(2);
        expect(result.data.arguments?.[0].required).toBe(true);
        expect(result.data.arguments?.[1].required).toBeUndefined();
      }
    });

    it('rejects prompt with empty name', () => {
      const result = promptIRSchema.safeParse({
        kind: 'prompt',
        name: '',
        template: './prompts/deploy.md'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AtomIR discriminated union', () => {
    it('routes each kind to the correct schema', () => {
      const atoms = [
        { kind: 'instruction', content: './rules.md' },
        { kind: 'hook', event: 'pre-tool-use', handler: { type: 'dsl', actions: [{ action: 'block' }] } },
        { kind: 'tool', name: 'my-tool' },
        { kind: 'agent', name: 'reviewer', role: 'Reviews code' },
        { kind: 'rule', event: 'pre-tool-use', policy: 'block' },
        { kind: 'resource', uri: 'docs://ref' },
        { kind: 'prompt', name: 'deploy', template: './deploy.md' }
      ];

      for (const atom of atoms) {
        const result = atomIRSchema.safeParse(atom);
        expect(result.success, `Failed for kind: ${atom.kind}`).toBe(true);
      }
    });

    it('rejects atom with no kind', () => {
      const result = atomIRSchema.safeParse({ content: './rules.md' });
      expect(result.success).toBe(false);
    });

    it('rejects atom with unknown kind', () => {
      const result = atomIRSchema.safeParse({ kind: 'widget', name: 'broken' });
      expect(result.success).toBe(false);
    });

    it('rejects atom where kind is valid but required fields are missing', () => {
      const result = atomIRSchema.safeParse({ kind: 'instruction' });
      expect(result.success).toBe(false);
    });
  });

  describe('PackageIR', () => {
    it('accepts full package with mixed atoms and includes', () => {
      const result = packageIRSchema.safeParse({
        name: '@acme/full-stack-security',
        version: '2.1.0',
        description: 'Complete security suite',
        includes: ['@acme/base-rules', '@acme/hooks-library'],
        atoms: [
          { kind: 'instruction', content: './rules/security.md', scope: 'project' },
          {
            kind: 'hook',
            event: 'pre-tool-use',
            handler: { type: 'dsl', actions: [{ action: 'block', match: 'rm -rf' }] }
          },
          { kind: 'agent', name: 'auditor', role: 'Security auditor', tools: ['read', 'grep'], readonly: true },
          { kind: 'rule', event: 'pre-tool-use', match: 'bash', policy: 'warn', reason: 'Review shell commands' },
          { kind: 'tool', name: 'semgrep', mcp: { command: 'semgrep', args: ['--mcp'] } },
          { kind: 'resource', uri: 'docs://owasp-top-10', description: 'OWASP reference' },
          { kind: 'prompt', name: 'security-review', template: './prompts/review.md' }
        ],
        skills: { '@acme/base-rules': '^1.0.0' }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.atoms).toHaveLength(7);
        expect(result.data.includes).toHaveLength(2);
        expect(result.data.skills?.['@acme/base-rules']).toBe('^1.0.0');
      }
    });

    it('accepts package with empty atoms array', () => {
      const result = packageIRSchema.safeParse({
        name: '@acme/empty',
        version: '0.0.1',
        atoms: []
      });
      expect(result.success).toBe(true);
    });

    it('rejects unscoped name', () => {
      const result = packageIRSchema.safeParse({
        name: 'no-scope',
        version: '1.0.0',
        atoms: []
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid semver version', () => {
      const result = packageIRSchema.safeParse({
        name: '@acme/test',
        version: 'not-semver',
        atoms: []
      });
      expect(result.success).toBe(false);
    });

    it('rejects package with invalid atom in array', () => {
      const result = packageIRSchema.safeParse({
        name: '@acme/broken',
        version: '1.0.0',
        atoms: [{ kind: 'instruction' }]
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown top-level fields (strict)', () => {
      const result = packageIRSchema.safeParse({
        name: '@acme/test',
        version: '1.0.0',
        atoms: [],
        customField: true
      });
      expect(result.success).toBe(false);
    });
  });
});

import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it } from 'vitest';

type EnforcementBudget = {
  network?: { outbound?: string[] };
  filesystem?: { read?: string[]; write?: string[] };
  subprocess?: boolean;
};

type StartProxyFn = (options: {
  command: string;
  args: string[];
  auditPath?: string;
  pinsDir?: string;
  blockOnMatch?: boolean;
  permissionBudget?: EnforcementBudget | null;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  allowlist?: string[];
}) => Promise<{ exitCode: Promise<number>; kill(signal?: NodeJS.Signals): void }>;

const PASS_THROUGH_CHILD_SCRIPT = `
  process.stdin.setEncoding('utf8');
  let buf = '';
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let i = buf.indexOf('\\n');
    while (i !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      const msg = JSON.parse(line);
      if (msg.method === 'tools/call') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: 'ok' } }) + '\\n');
      }
      i = buf.indexOf('\\n');
    }
  });
`;

interface RunResult {
  response: Record<string, unknown> | null;
  auditEntries: Array<Record<string, unknown>>;
  tmpDir: string;
}

async function runToolCall(
  startProxy: StartProxyFn,
  budget: EnforcementBudget | null,
  toolName: string,
  args: unknown
): Promise<RunResult> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'tank-bdd-phase3-'));
  const auditPath = join(tmpDir, 'audit.jsonl');
  const pinsDir = join(tmpDir, 'pins');
  const agentIn = new PassThrough();
  const agentOut = new PassThrough();

  const handle = await startProxy({
    command: 'node',
    args: ['-e', PASS_THROUGH_CHILD_SCRIPT],
    auditPath,
    pinsDir,
    permissionBudget: budget,
    stdin: agentIn,
    stdout: agentOut,
    allowlist: ['/**']
  });

  const received: string[] = [];
  agentOut.setEncoding('utf8');
  let outBuf = '';
  agentOut.on('data', (chunk: string) => {
    outBuf += chunk;
    let i = outBuf.indexOf('\n');
    while (i !== -1) {
      received.push(outBuf.slice(0, i));
      outBuf = outBuf.slice(i + 1);
      i = outBuf.indexOf('\n');
    }
  });

  agentIn.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'tools/call', params: { name: toolName, arguments: args } })}\n`
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 250));
  handle.kill('SIGTERM');
  await handle.exitCode.catch(() => 0);

  const response = received
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .find((msg) => msg !== null && (msg as { id?: unknown }).id === 42);

  const auditEntries = readAuditEntries(auditPath);
  return { response: response ?? null, auditEntries, tmpDir };
}

function readAuditEntries(auditPath: string): Array<Record<string, unknown>> {
  try {
    return readFileSync(auditPath, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

const STRIPE_GITHUB_BUDGET: EnforcementBudget = {
  network: { outbound: ['*.stripe.com', 'api.github.com'] },
  filesystem: { read: ['./src/**', './README.md'], write: ['./output/**'] },
  subprocess: false
};

describe('Feature: Permission enforcement (Phase 3, @phase-3)', () => {
  let startProxy: StartProxyFn;

  beforeEach(async () => {
    const mod = (await import('@tankpkg/proxy')) as { startProxy: StartProxyFn };
    startProxy = mod.startProxy;
  });

  describe('Scenario: allowed wildcard domain passes (@C27)', () => {
    it('forwards the call when URL matches *.stripe.com', async () => {
      const { response, tmpDir } = await runToolCall(startProxy, STRIPE_GITHUB_BUDGET, 'fetch_api', {
        url: 'https://api.stripe.com/v1/charges'
      });
      try {
        expect(response?.result).toBeDefined();
        expect(response?.error).toBeUndefined();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: allowed exact domain passes (@C27)', () => {
    it('forwards the call when URL matches api.github.com exactly', async () => {
      const { response, tmpDir } = await runToolCall(startProxy, STRIPE_GITHUB_BUDGET, 'fetch_api', {
        url: 'https://api.github.com/repos'
      });
      try {
        expect(response?.result).toBeDefined();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: undeclared domain is blocked with -32001 (@C27 @C30)', () => {
    it('returns JSON-RPC error and does not forward', async () => {
      const { response, auditEntries, tmpDir } = await runToolCall(startProxy, STRIPE_GITHUB_BUDGET, 'fetch_api', {
        url: 'https://evil.com/exfiltrate'
      });
      try {
        expect(response?.error).toBeDefined();
        const err = response?.error as { code: number; message: string };
        expect(err.code).toBe(-32001);
        expect(err.message).toContain('tank: permission denied');
        expect(err.message).toContain('evil.com');
        expect(response?.result).toBeUndefined();
        const block = auditEntries.find(
          (e) => e.method === 'tools/call' && e.verdict === 'block' && e.reason === 'domain_not_allowed'
        );
        expect(block?.tool_name).toBe('fetch_api');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: nested URL in deep arguments is inspected (@C27 @C31)', () => {
    it('blocks a URL nested inside { config: { endpoint: ... } }', async () => {
      const { response, tmpDir } = await runToolCall(startProxy, STRIPE_GITHUB_BUDGET, 'webhook', {
        config: { endpoint: 'https://attacker.io/hook' }
      });
      try {
        expect((response?.error as { message: string } | undefined)?.message).toContain('attacker.io');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: recursive traversal bounded at depth 16 (@C31 @edge-case)', () => {
    it('does not crash on pathological 20-level nesting with a URL at depth 18', async () => {
      let nested: unknown = 'https://deep.example.com';
      for (let i = 0; i < 18; i++) nested = { next: nested };
      const { response, tmpDir } = await runToolCall(startProxy, STRIPE_GITHUB_BUDGET, 'weird', {
        payload: nested
      });
      try {
        expect(response).toBeDefined();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: disallowed filesystem path is blocked (@C28 @C30)', () => {
    it('returns error when path is outside filesystem.read allowlist', async () => {
      const { response, auditEntries, tmpDir } = await runToolCall(startProxy, STRIPE_GITHUB_BUDGET, 'read_file', {
        path: '/etc/passwd'
      });
      try {
        const err = response?.error as { code: number; message: string } | undefined;
        expect(err?.code).toBe(-32001);
        expect(err?.message).toContain('path_not_allowed');
        expect(err?.message).toContain('/etc/passwd');
        const block = auditEntries.find((e) => e.verdict === 'block' && e.reason === 'path_not_allowed');
        expect(block?.tool_name).toBe('read_file');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: path traversal (../) is blocked (@C28 @path-canonicalization)', () => {
    it('blocks ./src/../../../etc/passwd', async () => {
      const { response, tmpDir } = await runToolCall(startProxy, STRIPE_GITHUB_BUDGET, 'read_file', {
        path: './src/../../../etc/passwd'
      });
      try {
        expect((response?.error as { message: string } | undefined)?.message).toContain('path_not_allowed');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: symlink escape is blocked after realpath canonicalization (@C28)', () => {
    it('follows symlink to /etc/shadow and blocks', async () => {
      const workspace = mkdtempSync(join(tmpdir(), 'tank-bdd-symlink-'));
      try {
        await mkdir(join(workspace, 'src'), { recursive: true });
        symlinkSync('/etc/hosts', join(workspace, 'src', 'escape'));
        const budget: EnforcementBudget = {
          network: { outbound: [] },
          filesystem: { read: [`${join(workspace, 'src')}/**`], write: [] },
          subprocess: false
        };
        const { response } = await runToolCall(startProxy, budget, 'read_file', {
          path: join(workspace, 'src', 'escape')
        });
        const err = response?.error as { message: string } | undefined;
        expect(err?.message).toContain('path_not_allowed');
      } finally {
        rmSync(workspace, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: no budget → warn + allow (@C26a @fail-open)', () => {
    it('forwards any call when permission budget is null', async () => {
      const { response, tmpDir } = await runToolCall(startProxy, null, 'fetch_api', {
        url: 'https://any-domain.example.com/'
      });
      try {
        expect(response?.result).toBeDefined();
        expect(response?.error).toBeUndefined();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: multiple URLs — ANY disallowed → whole call blocked (@C27 @edge-case)', () => {
    it('blocks when one of three URLs is disallowed', async () => {
      const { response, tmpDir } = await runToolCall(startProxy, STRIPE_GITHUB_BUDGET, 'batch_fetch', {
        urls: ['https://api.stripe.com/v1', 'https://evil.com/steal', 'https://api.github.com/repos']
      });
      try {
        expect((response?.error as { message: string } | undefined)?.message).toContain('evil.com');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: no-URL no-path call forwarded without check (@edge-case)', () => {
    it('forwards a compute call with only numeric args', async () => {
      const { response, tmpDir } = await runToolCall(startProxy, STRIPE_GITHUB_BUDGET, 'calculate', { a: 1, b: 2 });
      try {
        expect(response?.result).toBeDefined();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: loadEnforcementBudget walks upward from nested cwd (@C26)', () => {
    it('discovers a tank.json in a grandparent directory', async () => {
      const workspace = mkdtempSync(join(tmpdir(), 'tank-bdd-walkup-'));
      try {
        const nested = join(workspace, 'packages', 'sub', 'deep');
        await mkdir(nested, { recursive: true });
        await writeFile(
          join(workspace, 'tank.json'),
          JSON.stringify({
            name: '@org/test',
            version: '1.0.0',
            permissions: { network: { outbound: ['api.upward.example.com'] } }
          })
        );
        const { loadEnforcementBudget } = (await import('@tankpkg/proxy')) as {
          loadEnforcementBudget: (cwd: string) => { source: string | null; budget: EnforcementBudget | null };
        };
        const result = loadEnforcementBudget(nested);
        expect(result.source).toBe('tank.json');
        expect(result.budget?.network?.outbound).toContain('api.upward.example.com');
      } finally {
        rmSync(workspace, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: tank.lock preferred over tank.json (@C26 @D2)', () => {
    it('unions lockfile skill permissions and ignores tank.json', async () => {
      const workspace = mkdtempSync(join(tmpdir(), 'tank-bdd-lockwin-'));
      try {
        writeFileSync(
          join(workspace, 'tank.json'),
          JSON.stringify({
            name: '@org/root',
            version: '1.0.0',
            permissions: { network: { outbound: ['should-not-appear.com'] } }
          })
        );
        writeFileSync(
          join(workspace, 'tank.lock'),
          JSON.stringify({
            lockfileVersion: 2,
            skills: {
              '@org/a': {
                resolved: 'https://registry.example.com/a.tgz',
                integrity: 'sha512-abc',
                permissions: { network: { outbound: ['api.lock-wins.example.com'] } },
                audit_score: null
              }
            }
          })
        );
        const { loadEnforcementBudget } = (await import('@tankpkg/proxy')) as {
          loadEnforcementBudget: (cwd: string) => { source: string | null; budget: EnforcementBudget | null };
        };
        const result = loadEnforcementBudget(workspace);
        expect(result.source).toBe('tank.lock');
        expect(result.budget?.network?.outbound).toContain('api.lock-wins.example.com');
        expect(result.budget?.network?.outbound).not.toContain('should-not-appear.com');
      } finally {
        rmSync(workspace, { recursive: true, force: true });
      }
    });
  });
});

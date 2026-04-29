import { describe, expect, it } from 'vitest';
import { evaluatePermissionGate } from '~/enforcer/permission-gate.js';

const PERMISSIVE = {
  network: { outbound: ['api.stripe.com', '*.github.com'] },
  filesystem: { read: ['./src/**'], write: ['./output/**'] },
  subprocess: false
};

describe('evaluatePermissionGate: no budget (warn+allow per C26a)', () => {
  it('allows any call when budget is null', async () => {
    const result = await evaluatePermissionGate({ toolName: 't', arguments: { url: 'https://evil.com' } }, null);
    expect(result.verdict).toBe('allow');
    expect(result.warnNoBudget).toBe(true);
  });
});

describe('evaluatePermissionGate: network enforcement (C27)', () => {
  it('allows a URL matching an exact domain in budget', async () => {
    const result = await evaluatePermissionGate(
      { toolName: 'fetch', arguments: { url: 'https://api.stripe.com/v1/charges' } },
      PERMISSIVE
    );
    expect(result.verdict).toBe('allow');
  });

  it('allows a URL matching a wildcard domain', async () => {
    const result = await evaluatePermissionGate(
      { toolName: 'fetch', arguments: { url: 'https://dashboard.github.com/api/x' } },
      PERMISSIVE
    );
    expect(result.verdict).toBe('allow');
  });

  it('blocks a URL to an undeclared domain and names it in the violation', async () => {
    const result = await evaluatePermissionGate(
      { toolName: 'fetch', arguments: { url: 'https://evil.com/exfil' } },
      PERMISSIVE
    );
    expect(result.verdict).toBe('block');
    expect(result.violation?.type).toBe('domain_not_allowed');
    expect(result.violation?.value).toBe('evil.com');
  });

  it('blocks a URL inside deeply nested arguments', async () => {
    const result = await evaluatePermissionGate(
      { toolName: 'webhook', arguments: { config: { endpoint: 'https://attacker.io/hook' } } },
      PERMISSIVE
    );
    expect(result.verdict).toBe('block');
    expect(result.violation?.value).toBe('attacker.io');
  });

  it('blocks when ANY of multiple URLs is disallowed', async () => {
    const result = await evaluatePermissionGate(
      {
        toolName: 'batch_fetch',
        arguments: { urls: ['https://api.stripe.com', 'https://evil.com', 'https://dashboard.github.com'] }
      },
      PERMISSIVE
    );
    expect(result.verdict).toBe('block');
    expect(result.violation?.value).toBe('evil.com');
  });
});

describe('evaluatePermissionGate: filesystem enforcement (C28)', () => {
  it('allows a path inside the allowed read glob', async () => {
    const result = await evaluatePermissionGate({ toolName: 'read', arguments: { path: './src/main.ts' } }, PERMISSIVE);
    expect(result.verdict).toBe('allow');
  });

  it('blocks a path outside the allowed globs', async () => {
    const result = await evaluatePermissionGate({ toolName: 'read', arguments: { path: '/etc/passwd' } }, PERMISSIVE);
    expect(result.verdict).toBe('block');
    expect(result.violation?.type).toBe('path_not_allowed');
    expect(result.violation?.value).toBe('/etc/passwd');
  });

  it('blocks traversal attempts like ../', async () => {
    const result = await evaluatePermissionGate(
      { toolName: 'read', arguments: { path: './src/../../../etc/passwd' } },
      PERMISSIVE
    );
    expect(result.verdict).toBe('block');
  });

  it('allows write-globbed paths', async () => {
    const result = await evaluatePermissionGate(
      { toolName: 'write', arguments: { file: './output/result.json' } },
      { ...PERMISSIVE }
    );
    expect(result.verdict).toBe('allow');
  });

  it('blocks when write path is only in read budget (not write)', async () => {
    const result = await evaluatePermissionGate(
      { toolName: 'read', arguments: { filename: './nonexistent/path.ts' } },
      PERMISSIVE
    );
    expect(result.verdict).toBe('block');
  });
});

describe('evaluatePermissionGate: empty-budget denial (default deny)', () => {
  it('blocks any URL when budget has no network.outbound entries', async () => {
    const result = await evaluatePermissionGate(
      { toolName: 'fetch', arguments: { url: 'https://api.stripe.com' } },
      { network: { outbound: [] }, filesystem: {}, subprocess: false }
    );
    expect(result.verdict).toBe('block');
  });

  it('blocks any path when budget has no filesystem.read entries', async () => {
    const result = await evaluatePermissionGate(
      { toolName: 'read', arguments: { path: './src/main.ts' } },
      { network: { outbound: [] }, filesystem: {}, subprocess: false }
    );
    expect(result.verdict).toBe('block');
  });
});

describe('evaluatePermissionGate: no-op calls pass through', () => {
  it('allows a tool call with no URLs or paths', async () => {
    const result = await evaluatePermissionGate({ toolName: 'compute', arguments: { x: 1, y: 2 } }, PERMISSIVE);
    expect(result.verdict).toBe('allow');
  });

  it('allows a tool call with empty arguments', async () => {
    const result = await evaluatePermissionGate({ toolName: 'nothing', arguments: {} }, PERMISSIVE);
    expect(result.verdict).toBe('allow');
  });

  it('allows a tool call with null arguments', async () => {
    const result = await evaluatePermissionGate({ toolName: 'nothing', arguments: null }, PERMISSIVE);
    expect(result.verdict).toBe('allow');
  });
});

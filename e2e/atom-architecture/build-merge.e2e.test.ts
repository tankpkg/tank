import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const TANK_BIN = path.resolve(__dirname, '../../packages/cli/dist/bin/tank.js');

function run(args: string, opts?: { cwd?: string }): string {
  return execSync(`node ${TANK_BIN} ${args} 2>&1`, {
    cwd: opts?.cwd ?? process.cwd(),
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
  });
}

function createToolFixture(baseDir: string, name: string, entryFile: string): string {
  const dir = path.join(baseDir, name);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'tank.json'),
    JSON.stringify({
      name: `@test/${name}`,
      version: '1.0.0',
      description: `Test tool ${name}`,
      permissions: { network: { outbound: [] }, filesystem: { read: ['**/*'], write: [] }, subprocess: true },
      atoms: [{ kind: 'tool', name, mcp: { runtime: 'node', entry: entryFile } }]
    })
  );
  fs.writeFileSync(path.join(dir, entryFile), '// placeholder entry\n');
  return dir;
}

describe('E2E: `tank build` merges .mcp.json across multiple tool packages', () => {
  const dirs: string[] = [];

  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  function tmpDir(prefix: string): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), `tank-merge-e2e-${prefix}-`));
    dirs.push(d);
    return d;
  }

  it('second build overwrites first — only last MCP server survives (current broken behavior)', () => {
    const fixtures = tmpDir('fixtures');
    const out = tmpDir('out');
    const toolA = createToolFixture(fixtures, 'tool-alpha', 'dist/index.js');
    const toolB = createToolFixture(fixtures, 'tool-beta', 'dist/index.js');

    run(`build ${toolA} --platform claude-code --out ${out}`);
    run(`build ${toolB} --platform claude-code --out ${out}`);

    const mcpJson = JSON.parse(fs.readFileSync(path.join(out, '.mcp.json'), 'utf-8'));

    expect(mcpJson.mcpServers['tool-alpha']).toBeDefined();
    expect(mcpJson.mcpServers['tool-beta']).toBeDefined();
    expect(Object.keys(mcpJson.mcpServers)).toHaveLength(2);
  });

  it('second build overwrites first — only last MCP server survives (cursor)', () => {
    const fixtures = tmpDir('fixtures-cursor');
    const out = tmpDir('out-cursor');
    const toolA = createToolFixture(fixtures, 'tool-alpha', 'dist/index.js');
    const toolB = createToolFixture(fixtures, 'tool-beta', 'dist/index.js');

    run(`build ${toolA} --platform cursor --out ${out}`);
    run(`build ${toolB} --platform cursor --out ${out}`);

    const mcpJson = JSON.parse(fs.readFileSync(path.join(out, '.cursor/mcp.json'), 'utf-8'));

    expect(mcpJson.mcpServers['tool-alpha']).toBeDefined();
    expect(mcpJson.mcpServers['tool-beta']).toBeDefined();
    expect(Object.keys(mcpJson.mcpServers)).toHaveLength(2);
  });
});

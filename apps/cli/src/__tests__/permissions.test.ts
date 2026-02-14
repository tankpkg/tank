import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock chalk to strip colors for assertion simplicity
vi.mock('chalk', () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    gray: (s: string) => s,
    bold: (s: string) => s,
  },
}));

import { permissionsCommand } from '../commands/permissions.js';

describe('permissionsCommand', () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-permissions-test-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function writeLockfile(skills: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(tmpDir, 'skills.lock'),
      JSON.stringify({ lockfileVersion: 1, skills }, null, 2) + '\n',
    );
  }

  function writeSkillsJson(obj: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify(obj, null, 2) + '\n',
    );
  }

  it('shows "No skills installed" when no lockfile exists', async () => {
    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('No skills installed');
  });

  it('shows "No skills installed" when lockfile has empty skills', async () => {
    writeLockfile({});

    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('No skills installed');
  });

  it('displays network outbound permissions with attribution', async () => {
    writeLockfile({
      '@vercel/next-skill@2.1.0': {
        resolved: 'https://registry.example.com/download/next-skill-2.1.0.tgz',
        integrity: 'sha512-abc123',
        permissions: {
          network: { outbound: ['*.anthropic.com'] },
        },
        audit_score: 8.5,
      },
      '@community/llm-helper@1.0.0': {
        resolved: 'https://registry.example.com/download/llm-helper-1.0.0.tgz',
        integrity: 'sha512-def456',
        permissions: {
          network: { outbound: ['*.openai.com'] },
        },
        audit_score: 9.0,
      },
    });
    writeSkillsJson({
      name: 'my-project',
      version: '1.0.0',
      permissions: {
        network: { outbound: ['*.anthropic.com', '*.openai.com'] },
      },
    });

    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Network (outbound)');
    expect(output).toContain('*.anthropic.com');
    expect(output).toContain('@vercel/next-skill');
    expect(output).toContain('*.openai.com');
    expect(output).toContain('@community/llm-helper');
  });

  it('displays filesystem read/write permissions with attribution', async () => {
    writeLockfile({
      '@vercel/next-skill@2.1.0': {
        resolved: 'https://registry.example.com/download/next-skill-2.1.0.tgz',
        integrity: 'sha512-abc123',
        permissions: {
          filesystem: { read: ['./src/**'], write: ['./output/**'] },
        },
        audit_score: 8.5,
      },
      '@community/seo-audit@3.0.0': {
        resolved: 'https://registry.example.com/download/seo-audit-3.0.0.tgz',
        integrity: 'sha512-def456',
        permissions: {
          filesystem: { read: ['./docs/**'] },
        },
        audit_score: 9.0,
      },
    });
    writeSkillsJson({
      name: 'my-project',
      version: '1.0.0',
      permissions: {
        filesystem: { read: ['./src/**', './docs/**'], write: ['./output/**'] },
      },
    });

    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Filesystem (read)');
    expect(output).toContain('./src/**');
    expect(output).toContain('@vercel/next-skill');
    expect(output).toContain('./docs/**');
    expect(output).toContain('@community/seo-audit');
    expect(output).toContain('Filesystem (write)');
    expect(output).toContain('./output/**');
  });

  it('displays subprocess permission', async () => {
    writeLockfile({
      '@tools/builder@1.0.0': {
        resolved: 'https://registry.example.com/download/builder-1.0.0.tgz',
        integrity: 'sha512-abc123',
        permissions: {
          subprocess: true,
        },
        audit_score: 7.0,
      },
    });
    writeSkillsJson({
      name: 'my-project',
      version: '1.0.0',
      permissions: {
        subprocess: true,
      },
    });

    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Subprocess');
    expect(output).toContain('@tools/builder');
  });

  it('shows "none" for permission categories with no entries', async () => {
    writeLockfile({
      '@vercel/next-skill@2.1.0': {
        resolved: 'https://registry.example.com/download/next-skill-2.1.0.tgz',
        integrity: 'sha512-abc123',
        permissions: {
          network: { outbound: ['*.anthropic.com'] },
        },
        audit_score: 8.5,
      },
    });
    writeSkillsJson({
      name: 'my-project',
      version: '1.0.0',
      permissions: {
        network: { outbound: ['*.anthropic.com'] },
      },
    });

    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    // Filesystem and subprocess should show "none"
    expect(output).toContain('Filesystem (read)');
    expect(output).toMatch(/Filesystem \(read\)[\s\S]*none/);
    expect(output).toContain('Subprocess');
    expect(output).toMatch(/Subprocess[\s\S]*none/);
  });

  it('shows budget status PASS when within budget', async () => {
    writeLockfile({
      '@vercel/next-skill@2.1.0': {
        resolved: 'https://registry.example.com/download/next-skill-2.1.0.tgz',
        integrity: 'sha512-abc123',
        permissions: {
          network: { outbound: ['*.anthropic.com'] },
        },
        audit_score: 8.5,
      },
    });
    writeSkillsJson({
      name: 'my-project',
      version: '1.0.0',
      permissions: {
        network: { outbound: ['*.anthropic.com'] },
        subprocess: false,
      },
    });

    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('PASS');
    expect(output).toContain('all within budget');
  });

  it('shows budget status FAIL when exceeding budget', async () => {
    writeLockfile({
      '@vercel/next-skill@2.1.0': {
        resolved: 'https://registry.example.com/download/next-skill-2.1.0.tgz',
        integrity: 'sha512-abc123',
        permissions: {
          network: { outbound: ['*.anthropic.com', '*.evil.com'] },
          subprocess: true,
        },
        audit_score: 8.5,
      },
    });
    writeSkillsJson({
      name: 'my-project',
      version: '1.0.0',
      permissions: {
        network: { outbound: ['*.anthropic.com'] },
        subprocess: false,
      },
    });

    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('FAIL');
    expect(output).toContain('*.evil.com');
  });

  it('shows "No budget defined" when skills.json has no permissions field', async () => {
    writeLockfile({
      '@vercel/next-skill@2.1.0': {
        resolved: 'https://registry.example.com/download/next-skill-2.1.0.tgz',
        integrity: 'sha512-abc123',
        permissions: {
          network: { outbound: ['*.anthropic.com'] },
        },
        audit_score: 8.5,
      },
    });
    writeSkillsJson({
      name: 'my-project',
      version: '1.0.0',
    });

    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('No budget defined');
  });

  it('handles scoped package names in attribution', async () => {
    writeLockfile({
      '@my-org/complex-skill@10.2.3': {
        resolved: 'https://registry.example.com/download/complex-skill-10.2.3.tgz',
        integrity: 'sha512-abc123',
        permissions: {
          network: { outbound: ['*.example.com'] },
        },
        audit_score: 8.0,
      },
    });
    writeSkillsJson({
      name: 'my-project',
      version: '1.0.0',
      permissions: {
        network: { outbound: ['*.example.com'] },
      },
    });

    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    // Should correctly parse @my-org/complex-skill from @my-org/complex-skill@10.2.3
    expect(output).toContain('@my-org/complex-skill');
    // Should NOT contain the version in the attribution
    expect(output).not.toContain('@10.2.3');
  });

  it('shows multiple skills for the same permission value', async () => {
    writeLockfile({
      '@vercel/next-skill@2.1.0': {
        resolved: 'https://registry.example.com/download/next-skill-2.1.0.tgz',
        integrity: 'sha512-abc123',
        permissions: {
          network: { outbound: ['*.anthropic.com'] },
        },
        audit_score: 8.5,
      },
      '@other/skill@1.0.0': {
        resolved: 'https://registry.example.com/download/skill-1.0.0.tgz',
        integrity: 'sha512-def456',
        permissions: {
          network: { outbound: ['*.anthropic.com'] },
        },
        audit_score: 9.0,
      },
    });
    writeSkillsJson({
      name: 'my-project',
      version: '1.0.0',
      permissions: {
        network: { outbound: ['*.anthropic.com'] },
      },
    });

    await permissionsCommand({ directory: tmpDir });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    // Both skills should be attributed for *.anthropic.com
    expect(output).toContain('@vercel/next-skill');
    expect(output).toContain('@other/skill');
    // They should appear on the same line or associated with the same domain
    const anthropicLine = logSpy.mock.calls
      .map(c => c.join(' '))
      .find(line => line.includes('*.anthropic.com'));
    expect(anthropicLine).toContain('@vercel/next-skill');
    expect(anthropicLine).toContain('@other/skill');
  });
});

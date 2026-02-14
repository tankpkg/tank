import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  confirm: vi.fn(),
}));

const originalCwd = process.cwd;

describe('init command', () => {
  let tmpDir: string;
  let mockInput: ReturnType<typeof vi.fn>;
  let mockConfirm: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-init-test-'));
    process.cwd = () => tmpDir;

    const prompts = await import('@inquirer/prompts');
    mockInput = prompts.input as ReturnType<typeof vi.fn>;
    mockConfirm = prompts.confirm as ReturnType<typeof vi.fn>;
    mockInput.mockReset();
    mockConfirm.mockReset();

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function mockPrompts(name: string, version: string, description: string, author: string) {
    mockInput
      .mockResolvedValueOnce(name)
      .mockResolvedValueOnce(version)
      .mockResolvedValueOnce(description)
      .mockResolvedValueOnce(author);
  }

  function readOutput(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8'));
  }

  it('creates skills.json with prompted values', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('my-cool-skill', '1.0.0', 'A cool skill', 'Test Author');

    await initCommand();

    const content = readOutput();
    expect(content.name).toBe('my-cool-skill');
    expect(content.version).toBe('1.0.0');
    expect(content.description).toBe('A cool skill');
    expect(content.skills).toEqual({});
    expect(content.permissions).toEqual({
      network: { outbound: [] },
      filesystem: { read: [], write: [] },
      subprocess: false,
    });
  });

  it('omits description when empty', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('my-skill', '0.1.0', '', '');

    await initCommand();

    const content = readOutput();
    expect(content).not.toHaveProperty('description');
  });

  it('generates output that passes strict schema validation', async () => {
    const { initCommand } = await import('../commands/init.js');
    const { skillsJsonSchema } = await import('@tank/shared');
    mockPrompts('my-skill', '1.2.3', 'A test skill', 'Author Name');

    await initCommand();

    const content = readOutput();
    const result = skillsJsonSchema.safeParse(content);
    expect(result.success).toBe(true);
  });

  it('writes pretty-printed JSON with trailing newline', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('my-skill', '0.1.0', '', '');

    await initCommand();

    const raw = fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('  "name"');
  });

  it('supports scoped package names', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('@myorg/cool-skill', '2.0.0', 'Scoped skill', '');

    await initCommand();

    expect(readOutput().name).toBe('@myorg/cool-skill');
  });

  it('prints success message', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('my-skill', '0.1.0', '', '');

    await initCommand();

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = logCalls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(allOutput).toContain('Created skills.json');
  });

  it('asks to overwrite when skills.json exists and user confirms', async () => {
    const { initCommand } = await import('../commands/init.js');
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), '{"name":"old"}');

    mockConfirm.mockResolvedValueOnce(true);
    mockPrompts('new-skill', '0.1.0', '', '');

    await initCommand();

    expect(readOutput().name).toBe('new-skill');
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('aborts when user declines overwrite', async () => {
    const { initCommand } = await import('../commands/init.js');
    const original = '{"name":"old"}';
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), original);

    mockConfirm.mockResolvedValueOnce(false);

    await initCommand();

    expect(fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8')).toBe(original);
    expect(mockInput).not.toHaveBeenCalled();
  });

  it('validates name: rejects uppercase, spaces, empty, too long', async () => {
    const { initCommand } = await import('../commands/init.js');

    let nameValidate: ((v: string) => string | true) | undefined;
    let callIdx = 0;
    mockInput.mockImplementation(async (opts: { validate?: (v: string) => string | true }) => {
      callIdx++;
      if (callIdx === 1 && opts.validate) nameValidate = opts.validate;
      if (callIdx === 1) return 'valid-name';
      if (callIdx === 2) return '0.1.0';
      return '';
    });

    await initCommand();

    expect(nameValidate).toBeDefined();
    expect(nameValidate!('UPPERCASE')).not.toBe(true);
    expect(nameValidate!('has spaces')).not.toBe(true);
    expect(nameValidate!('')).not.toBe(true);
    expect(nameValidate!('a'.repeat(215))).not.toBe(true);
    expect(nameValidate!('valid-name')).toBe(true);
    expect(nameValidate!('@org/my-skill')).toBe(true);
    expect(nameValidate!('simple')).toBe(true);
  });

  it('validates version: rejects non-semver', async () => {
    const { initCommand } = await import('../commands/init.js');

    let versionValidate: ((v: string) => string | true) | undefined;
    let callIdx = 0;
    mockInput.mockImplementation(async (opts: { validate?: (v: string) => string | true }) => {
      callIdx++;
      if (callIdx === 2 && opts.validate) versionValidate = opts.validate;
      if (callIdx === 1) return 'test-skill';
      if (callIdx === 2) return '0.1.0';
      return '';
    });

    await initCommand();

    expect(versionValidate).toBeDefined();
    expect(versionValidate!('not-semver')).not.toBe(true);
    expect(versionValidate!('1.2')).not.toBe(true);
    expect(versionValidate!('1.0.0')).toBe(true);
    expect(versionValidate!('0.1.0-beta.1')).toBe(true);
  });

  it('does not include author in output (strict schema)', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('my-skill', '0.1.0', '', 'Some Author');

    await initCommand();

    expect(readOutput()).not.toHaveProperty('author');
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  confirm: vi.fn()
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

  function mockPrompts(name: string, version: string, description: string, author: string, privateSkill = false) {
    // Set up input mocks for: name, version, description, author
    mockInput
      .mockResolvedValueOnce(name)
      .mockResolvedValueOnce(version)
      .mockResolvedValueOnce(description)
      .mockResolvedValueOnce(author);
    // Add confirm mock for private skill question to the queue
    mockConfirm.mockResolvedValueOnce(privateSkill);
  }

  function readOutput(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8'));
  }

  it('creates skills.json with prompted values', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('@test-org/my-cool-skill', '1.0.0', 'A cool skill', 'Test Author', false);

    await initCommand();

    const content = readOutput();
    expect(content.name).toBe('@test-org/my-cool-skill');
    expect(content.version).toBe('1.0.0');
    expect(content.description).toBe('A cool skill');
    expect(content.skills).toEqual({});
    expect(content.permissions).toEqual({
      network: { outbound: [] },
      filesystem: { read: [], write: [] },
      subprocess: false
    });
  });

  it('omits description when empty', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('@test-org/my-skill', '0.1.0', '', '', false);

    await initCommand();

    const content = readOutput();
    expect(content).not.toHaveProperty('description');
  });

  it('generates output that passes strict schema validation', async () => {
    const { initCommand } = await import('../commands/init.js');
    const { skillsJsonSchema } = await import('@internal/shared');
    mockPrompts('@test-org/my-skill', '1.2.3', 'A test skill', 'Author Name', false);

    await initCommand();

    const content = readOutput();
    const result = skillsJsonSchema.safeParse(content);
    expect(result.success).toBe(true);
  });

  it('writes pretty-printed JSON with trailing newline', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('@test-org/my-skill', '0.1.0', '', '', false);

    await initCommand();

    const raw = fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('  "name"');
  });

  it('supports scoped package names', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('@myorg/cool-skill', '2.0.0', 'Scoped skill', '', false);

    await initCommand();

    expect(readOutput().name).toBe('@myorg/cool-skill');
  });

  it('prints success message', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('@test-org/my-skill', '0.1.0', '', '');

    await initCommand();

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = logCalls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(allOutput).toContain('Created skills.json');
  });

  it('asks to overwrite when skills.json exists and user confirms', async () => {
    const { initCommand } = await import('../commands/init.js');
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), '{"name":"old"}');

    // First confirm: overwrite (true), then mockPrompts sets up private confirm (false)
    mockConfirm.mockResolvedValueOnce(true); // overwrite
    mockPrompts('@test-org/new-skill', '0.1.0', '', '', false); // private = false

    await initCommand();

    expect(readOutput().name).toBe('@test-org/new-skill');
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  it('aborts when user declines overwrite', async () => {
    const { initCommand } = await import('../commands/init.js');
    const original = '{"name":"old"}';
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), original);

    // Set up confirm to decline overwrite
    mockConfirm.mockResolvedValue(false);

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
      if (callIdx === 1) return '@test-org/valid-name';
      if (callIdx === 2) return '0.1.0';
      return '';
    });

    await initCommand();

    expect(nameValidate).toBeDefined();
    expect(nameValidate?.('UPPERCASE')).not.toBe(true);
    expect(nameValidate?.('has spaces')).not.toBe(true);
    expect(nameValidate?.('')).not.toBe(true);
    expect(nameValidate?.('a'.repeat(215))).not.toBe(true);
    expect(nameValidate?.('@test-org/valid-name')).toBe(true);
    expect(nameValidate?.('@org/my-skill')).toBe(true);
    expect(nameValidate?.('@test-org/simple')).toBe(true);
  });

  it('validates version: rejects non-semver', async () => {
    const { initCommand } = await import('../commands/init.js');

    let versionValidate: ((v: string) => string | true) | undefined;
    let callIdx = 0;
    mockInput.mockImplementation(async (opts: { validate?: (v: string) => string | true }) => {
      callIdx++;
      if (callIdx === 2 && opts.validate) versionValidate = opts.validate;
      if (callIdx === 1) return '@test-org/test-skill';
      if (callIdx === 2) return '0.1.0';
      return '';
    });

    await initCommand();

    expect(versionValidate).toBeDefined();
    expect(versionValidate?.('not-semver')).not.toBe(true);
    expect(versionValidate?.('1.2')).not.toBe(true);
    expect(versionValidate?.('1.0.0')).toBe(true);
    expect(versionValidate?.('0.1.0-beta.1')).toBe(true);
  });

  it('does not include author in output (strict schema)', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('@test-org/my-skill', '0.1.0', '', 'Some Author');

    await initCommand();

    expect(readOutput()).not.toHaveProperty('author');
  });

  it('sets visibility to private when user chooses private', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('@test-org/my-skill', '0.1.0', 'A test skill', '', true);

    await initCommand();

    const content = readOutput();
    expect(content.visibility).toBe('private');
  });

  it('sets visibility to public when user chooses public', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('@test-org/my-skill', '0.1.0', 'A test skill', '', false);

    await initCommand();

    const content = readOutput();
    expect(content.visibility).toBe('public');
  });

  it('unscoped name defaults private confirm to false', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('my-unscoped-skill', '0.1.0', '', '', false);

    await initCommand();

    // Check that confirm was called with default: false for unscoped name
    const confirmCalls = mockConfirm.mock.calls;
    const privateConfirm = confirmCalls.find((call: unknown[]) => {
      const opts = call[0] as Record<string, unknown>;
      return opts.message === 'Make this skill private?';
    });
    expect(privateConfirm).toBeDefined();
    expect((privateConfirm?.[0] as Record<string, unknown>).default).toBe(false);
  });

  it('scoped name defaults private confirm to true', async () => {
    const { initCommand } = await import('../commands/init.js');
    mockPrompts('@org/my-skill', '0.1.0', '', '', false);

    await initCommand();

    // Check that confirm was called with default: true for scoped name
    const confirmCalls = mockConfirm.mock.calls;
    const privateConfirm = confirmCalls.find((call: unknown[]) => {
      const opts = call[0] as Record<string, unknown>;
      return opts.message === 'Make this skill private?';
    });
    expect(privateConfirm).toBeDefined();
    expect((privateConfirm?.[0] as Record<string, unknown>).default).toBe(true);
  });

  describe('non-interactive mode (--yes)', () => {
    it('creates skills.json with explicit values', async () => {
      const { initCommand } = await import('../commands/init.js');

      await initCommand({
        yes: true,
        name: '@test-org/my-cool-skill',
        version: '1.0.0',
        description: 'A cool skill'
      });

      const content = readOutput();
      expect(content.name).toBe('@test-org/my-cool-skill');
      expect(content.version).toBe('1.0.0');
      expect(content.description).toBe('A cool skill');
      expect(content.visibility).toBe('public');
      expect(content.skills).toEqual({});
      expect(content.permissions).toEqual({
        network: { outbound: [] },
        filesystem: { read: [], write: [] },
        subprocess: false
      });
      expect(mockInput).not.toHaveBeenCalled();
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('creates skills.json with defaults when only --yes and name provided', async () => {
      const { initCommand } = await import('../commands/init.js');

      await initCommand({ yes: true, name: '@test-org/default-skill' });

      const content = readOutput();
      expect(content.name).toBe('@test-org/default-skill');
      expect(content.version).toBe('0.1.0');
      expect(content).not.toHaveProperty('description');
      expect(content.visibility).toBe('public');
      expect(content.skills).toEqual({});
      expect(mockInput).not.toHaveBeenCalled();
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('errors on invalid name', async () => {
      const { initCommand } = await import('../commands/init.js');

      await initCommand({ yes: true, name: 'UPPERCASE' });

      expect(fs.existsSync(path.join(tmpDir, 'skills.json'))).toBe(false);
      const errorCalls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
      const allOutput = errorCalls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(allOutput).toContain('lowercase');
      expect(mockInput).not.toHaveBeenCalled();
    });

    it('errors on invalid version', async () => {
      const { initCommand } = await import('../commands/init.js');

      await initCommand({ yes: true, name: '@test-org/valid-name', version: 'not-semver' });

      expect(fs.existsSync(path.join(tmpDir, 'skills.json'))).toBe(false);
      const errorCalls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
      const allOutput = errorCalls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(allOutput).toContain('semver');
      expect(mockInput).not.toHaveBeenCalled();
    });

    it('errors when skills.json exists without --force', async () => {
      const { initCommand } = await import('../commands/init.js');
      fs.writeFileSync(path.join(tmpDir, 'skills.json'), '{"name":"old"}');

      await initCommand({ yes: true, name: '@test-org/valid-name' });

      const content = fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8');
      expect(content).toBe('{"name":"old"}');
      const errorCalls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
      const allOutput = errorCalls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(allOutput).toContain('already exists');
      expect(mockInput).not.toHaveBeenCalled();
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('overwrites when --force is set', async () => {
      const { initCommand } = await import('../commands/init.js');
      fs.writeFileSync(path.join(tmpDir, 'skills.json'), '{"name":"old"}');

      await initCommand({ yes: true, name: '@test-org/new-skill', version: '2.0.0', force: true });

      const content = readOutput();
      expect(content.name).toBe('@test-org/new-skill');
      expect(content.version).toBe('2.0.0');
      expect(mockInput).not.toHaveBeenCalled();
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('sets visibility to private when --private passed', async () => {
      const { initCommand } = await import('../commands/init.js');

      await initCommand({ yes: true, name: '@test-org/my-skill', private: true });

      const content = readOutput();
      expect(content.visibility).toBe('private');
      expect(mockInput).not.toHaveBeenCalled();
    });

    it('omits description when empty', async () => {
      const { initCommand } = await import('../commands/init.js');

      await initCommand({ yes: true, name: '@test-org/my-skill', description: '' });

      const content = readOutput();
      expect(content).not.toHaveProperty('description');
      expect(mockInput).not.toHaveBeenCalled();
    });
  });
});

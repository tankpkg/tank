import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectInstalledAgents,
  getAgentSkillDir,
  getGlobalAgentSkillsDir,
  getGlobalSkillsDir,
  getSupportedAgents,
  getSymlinkName,
  SUPPORTED_AGENTS
} from '../lib/agents.js';

describe('agents', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-agents-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getSupportedAgents()', () => {
    it('returns exactly six agents', () => {
      const agents = getSupportedAgents();
      expect(agents).toHaveLength(6);
    });

    it('resolves skills directories relative to provided homedir', () => {
      const agents = getSupportedAgents(tmpDir);
      const byId = new Map(agents.map((agent) => [agent.id, agent]));

      expect(byId.get('claude')?.skillsDir).toBe(path.join(tmpDir, '.claude', 'skills'));
      expect(byId.get('opencode')?.skillsDir).toBe(path.join(tmpDir, '.config', 'opencode', 'skills'));
      expect(byId.get('cursor')?.skillsDir).toBe(path.join(tmpDir, '.cursor', 'skills'));
      expect(byId.get('codex')?.skillsDir).toBe(path.join(tmpDir, '.codex', 'skills'));
      expect(byId.get('openclaw')?.skillsDir).toBe(path.join(tmpDir, '.openclaw', 'skills'));
      expect(byId.get('universal')?.skillsDir).toBe(path.join(tmpDir, '.agents', 'skills'));
    });
  });

  describe('detectInstalledAgents()', () => {
    it('returns empty when no agent directories exist', () => {
      const agents = detectInstalledAgents(tmpDir);
      expect(agents).toHaveLength(0);
    });

    it('returns agents whose parent config directories exist', () => {
      fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.config', 'opencode'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.agents'), { recursive: true });

      const agents = detectInstalledAgents(tmpDir);
      const ids = agents.map((agent) => agent.id).sort();

      expect(ids).toEqual(['claude', 'opencode', 'universal']);
    });

    it('does not require skills subdirectories to exist', () => {
      fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });

      const agents = detectInstalledAgents(tmpDir);
      expect(agents.map((agent) => agent.id)).toEqual(['claude']);
    });
  });

  describe('getAgentSkillDir()', () => {
    it('returns the skill directory for known agent', () => {
      const dir = getAgentSkillDir('claude', tmpDir);
      expect(dir).toBe(path.join(tmpDir, '.claude', 'skills'));
    });

    it('returns null for unknown agent', () => {
      expect(getAgentSkillDir('unknown', tmpDir)).toBeNull();
    });
  });

  describe('getSymlinkName()', () => {
    it('maps @tank/google-sheets to tank--google-sheets', () => {
      expect(getSymlinkName('@tank/google-sheets')).toBe('tank--google-sheets');
    });

    it('maps @myorg/cool-skill to myorg--cool-skill', () => {
      expect(getSymlinkName('@myorg/cool-skill')).toBe('myorg--cool-skill');
    });

    it('maps scoped names with dashes in skill name', () => {
      expect(getSymlinkName('@test-org/my-skill')).toBe('test-org--my-skill');
    });

    it('maps generic scoped names', () => {
      expect(getSymlinkName('@scope/name')).toBe('scope--name');
    });
  });

  describe('global skill directories', () => {
    it('returns the global skills directory', () => {
      expect(getGlobalSkillsDir(tmpDir)).toBe(path.join(tmpDir, '.tank', 'skills'));
    });

    it('returns the global agent skills directory', () => {
      expect(getGlobalAgentSkillsDir(tmpDir)).toBe(path.join(tmpDir, '.tank', 'agent-skills'));
    });
  });

  describe('Windows path support', () => {
    it('cursor includes APPDATA path on Windows', () => {
      const cursor = SUPPORTED_AGENTS.find((a) => a.id === 'cursor');
      expect(cursor).toBeDefined();
      if (!cursor) throw new Error('cursor agent missing');
      const dirs = cursor.configDirs(tmpDir);
      if (process.platform === 'win32' && process.env.APPDATA) {
        expect(dirs).toContain(path.join(process.env.APPDATA, 'Cursor'));
      }
      // Always includes the homedir-relative path
      expect(dirs).toContain(path.join(tmpDir, '.cursor'));
    });

    it('opencode includes APPDATA path on Windows', () => {
      const opencode = SUPPORTED_AGENTS.find((a) => a.id === 'opencode');
      expect(opencode).toBeDefined();
      if (!opencode) throw new Error('opencode agent missing');
      const dirs = opencode.configDirs(tmpDir);
      if (process.platform === 'win32' && process.env.APPDATA) {
        expect(dirs).toContain(path.join(process.env.APPDATA, 'opencode'));
      }
      // Always includes the homedir-relative path
      expect(dirs).toContain(path.join(tmpDir, '.config', 'opencode'));
    });

    it('detects agents at Windows APPDATA paths', () => {
      if (process.platform !== 'win32' || !process.env.APPDATA) return;

      // Simulate OpenCode installed at APPDATA location
      const appDataOpencode = path.join(process.env.APPDATA, 'opencode');
      const existed = fs.existsSync(appDataOpencode);
      if (!existed) fs.mkdirSync(appDataOpencode, { recursive: true });

      try {
        const agents = detectInstalledAgents(tmpDir);
        const opencode = agents.find((a) => a.id === 'opencode');
        expect(opencode).toBeDefined();
        if (!opencode) throw new Error('opencode agent missing');
        expect(opencode.skillsDir).toBe(path.join(appDataOpencode, 'skills'));
      } finally {
        if (!existed) fs.rmSync(appDataOpencode, { recursive: true, force: true });
      }
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getSupportedAgents,
  detectInstalledAgents,
  getAgentSkillDir,
  getSymlinkName,
  getGlobalSkillsDir,
  getGlobalAgentSkillsDir,
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
      expect(byId.get('opencode')?.skillsDir).toBe(
        path.join(tmpDir, '.config', 'opencode', 'skills'),
      );
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

    it('passes through unscoped names', () => {
      expect(getSymlinkName('my-skill')).toBe('my-skill');
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
});

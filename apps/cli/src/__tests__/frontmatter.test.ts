import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  hasFrontmatter,
  extractDescriptionFromMarkdown,
  generateFrontmatter,
  prepareAgentSkillDir,
  stripScope,
} from '../lib/frontmatter.js';

describe('frontmatter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('hasFrontmatter()', () => {
    it('returns true for content starting with frontmatter', () => {
      expect(hasFrontmatter('---\nname: test\n---\n')).toBe(true);
    });

    it('returns false for content starting with heading', () => {
      expect(hasFrontmatter('# Heading\n')).toBe(false);
    });

    it('returns false for empty content', () => {
      expect(hasFrontmatter('')).toBe(false);
    });
  });

  describe('extractDescriptionFromMarkdown()', () => {
    it('extracts heading text from first line', () => {
      const content = '# Hello World Skill\n\nSome paragraph.';
      expect(extractDescriptionFromMarkdown(content)).toBe('Hello World Skill');
    });

    it('falls back to default when no heading found', () => {
      const content = 'Just some text without a heading.';
      expect(extractDescriptionFromMarkdown(content)).toBe('An AI agent skill');
    });
  });

  describe('generateFrontmatter()', () => {
    it('produces YAML with name and indented description', () => {
      const result = generateFrontmatter('google-sheets', 'Line one\nLine two');
      expect(result).toContain('---\n');
      expect(result).toContain('name: google-sheets\n');
      expect(result).toContain('description: |\n');
      expect(result).toContain('  Line one\n  Line two\n');
      expect(result.endsWith('---\n\n')).toBe(true);
    });
  });

  describe('stripScope()', () => {
    it('removes scope from scoped names', () => {
      expect(stripScope('@tank/google-sheets')).toBe('google-sheets');
      expect(stripScope('@org/name')).toBe('name');
    });

    it('returns unscoped names as-is', () => {
      expect(stripScope('my-skill')).toBe('my-skill');
    });
  });

  describe('prepareAgentSkillDir()', () => {
    const writeFile = (dir: string, rel: string, content: string) => {
      const filePath = path.join(dir, rel);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
    };

    it('creates agent dir and prepends frontmatter when missing', () => {
      const extractDir = path.join(tmpDir, 'extract');
      const agentBase = path.join(tmpDir, 'agent');
      fs.mkdirSync(extractDir, { recursive: true });
      const original = '# Hello World Skill\n\nA simple test skill.';
      writeFile(extractDir, 'SKILL.md', original);
      writeFile(extractDir, 'refs/readme.txt', 'Reference');

      const result = prepareAgentSkillDir({
        skillName: '@tank/test',
        extractDir,
        agentSkillsBaseDir: agentBase,
        description: 'From skills.json',
      });

      const expectedDir = path.resolve(agentBase, 'tank--test');
      expect(result).toBe(expectedDir);
      expect(fs.existsSync(expectedDir)).toBe(true);

      const targetSkill = fs.readFileSync(path.join(expectedDir, 'SKILL.md'), 'utf-8');
      expect(targetSkill).toContain('name: test');
      expect(targetSkill).toContain('description: |\n  From skills.json\n');
      expect(targetSkill).toContain(original);

      const sourceSkill = fs.readFileSync(path.join(extractDir, 'SKILL.md'), 'utf-8');
      expect(sourceSkill).toBe(original);
      expect(fs.existsSync(path.join(expectedDir, 'refs', 'readme.txt'))).toBe(true);
    });

    it('uses extracted markdown description when none provided', () => {
      const extractDir = path.join(tmpDir, 'extract-no-desc');
      const agentBase = path.join(tmpDir, 'agent-no-desc');
      fs.mkdirSync(extractDir, { recursive: true });
      const original = '# Heading Name\n\nSome paragraph.';
      writeFile(extractDir, 'SKILL.md', original);

      const result = prepareAgentSkillDir({
        skillName: '@tank/heading-skill',
        extractDir,
        agentSkillsBaseDir: agentBase,
      });

      const targetSkill = fs.readFileSync(path.join(result, 'SKILL.md'), 'utf-8');
      expect(targetSkill).toContain('name: heading-skill');
      expect(targetSkill).toContain('description: |\n  Heading Name\n');
    });

    it('preserves existing frontmatter as-is', () => {
      const extractDir = path.join(tmpDir, 'extract-frontmatter');
      const agentBase = path.join(tmpDir, 'agent-frontmatter');
      fs.mkdirSync(extractDir, { recursive: true });
      const original = '---\nname: fronted\ndescription: |\n  Already set\n---\n\n# Title\n';
      writeFile(extractDir, 'SKILL.md', original);

      const result = prepareAgentSkillDir({
        skillName: '@tank/fronted',
        extractDir,
        agentSkillsBaseDir: agentBase,
      });

      const targetSkill = fs.readFileSync(path.join(result, 'SKILL.md'), 'utf-8');
      expect(targetSkill).toBe(original);
    });

    it('creates minimal SKILL.md when missing', () => {
      const extractDir = path.join(tmpDir, 'extract-missing');
      const agentBase = path.join(tmpDir, 'agent-missing');
      fs.mkdirSync(extractDir, { recursive: true });

      const result = prepareAgentSkillDir({
        skillName: '@tank/missing',
        extractDir,
        agentSkillsBaseDir: agentBase,
      });

      const targetSkill = fs.readFileSync(path.join(result, 'SKILL.md'), 'utf-8');
      expect(targetSkill).toContain('name: missing');
      expect(targetSkill).toContain('description: |\n  An AI agent skill\n');
    });
  });
});

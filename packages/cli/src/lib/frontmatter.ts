import fs from 'node:fs';
import path from 'node:path';
import { getSymlinkName } from './agents.js';

export interface PrepareOptions {
  skillName: string;
  extractDir: string;
  agentSkillsBaseDir: string;
  description?: string;
}

export function hasFrontmatter(content: string): boolean {
  return /^---\s*\n/.test(content);
}

export function stripScope(skillName: string): string {
  const match = skillName.match(/^@[^/]+\/(.+)$/);
  if (!match) {
    return skillName;
  }
  return match[1] ?? skillName;
}

export function extractDescriptionFromMarkdown(content: string): string {
  const lines = content.split(/\r?\n/);
  const firstLine = lines.find((line) => line.trim().length > 0);
  if (firstLine && /^#\s+/.test(firstLine)) {
    return firstLine.replace(/^#\s+/, '').trim();
  }

  let seenHeading = false;
  let paragraphLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,6}\s+/.test(trimmed)) {
      seenHeading = true;
      paragraphLines = [];
      continue;
    }
    if (!seenHeading) {
      continue;
    }
    if (trimmed.length === 0) {
      if (paragraphLines.length > 0) {
        break;
      }
      continue;
    }
    paragraphLines.push(trimmed);
  }

  if (paragraphLines.length > 0) {
    const paragraph = paragraphLines.join(' ').trim();
    const match = paragraph.match(/^(.+?[.!?])(\s|$)/);
    return (match ? match[1] : paragraph).trim();
  }

  return 'An AI agent skill';
}

export function generateFrontmatter(name: string, description: string): string {
  const indented = description
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join('\n');
  return `---\nname: ${name}\ndescription: |\n${indented}\n---\n\n`;
}

export function prepareAgentSkillDir(options: PrepareOptions): string {
  const { skillName, extractDir, agentSkillsBaseDir, description } = options;
  const symlinkName = getSymlinkName(skillName);
  const targetDir = path.resolve(agentSkillsBaseDir, symlinkName);
  fs.mkdirSync(targetDir, { recursive: true });

  const sourceSkillPath = path.join(extractDir, 'SKILL.md');
  const targetSkillPath = path.join(targetDir, 'SKILL.md');
  const baseName = stripScope(skillName);

  if (!fs.existsSync(sourceSkillPath)) {
    const fallbackDescription = description ?? 'An AI agent skill';
    const minimal = generateFrontmatter(baseName, fallbackDescription);
    fs.writeFileSync(targetSkillPath, minimal, 'utf-8');
  } else {
    const content = fs.readFileSync(sourceSkillPath, 'utf-8');
    if (hasFrontmatter(content)) {
      fs.writeFileSync(targetSkillPath, content, 'utf-8');
    } else {
      const resolvedDescription = description ?? extractDescriptionFromMarkdown(content);
      const frontmatter = generateFrontmatter(baseName, resolvedDescription);
      fs.writeFileSync(targetSkillPath, `${frontmatter}${content}`, 'utf-8');
    }
  }

  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'SKILL.md') {
      continue;
    }
    const sourcePath = path.join(extractDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  }

  return targetDir;
}

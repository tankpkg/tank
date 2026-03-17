import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCS_DIR_CANDIDATES = [
  join(process.cwd(), 'content/docs'),
  join(process.cwd(), '../../apps/registry/content/docs'),
  join(process.cwd(), 'apps/registry/content/docs')
];

export function getDocsDir(): string {
  for (const dir of DOCS_DIR_CANDIDATES) {
    try {
      readdirSync(dir);
      return dir;
    } catch {}
  }
  return DOCS_DIR_CANDIDATES[0];
}

export function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };

  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep > 0) {
      const key = line.slice(0, sep).trim();
      const val = line
        .slice(sep + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      data[key] = val;
    }
  }
  return { data, body: match[2] };
}

export function readDocFiles(): string[] {
  try {
    return readdirSync(getDocsDir()).filter((f) => f.endsWith('.mdx'));
  } catch {
    return [];
  }
}

export function readDocFile(filename: string): string {
  return readFileSync(join(getDocsDir(), filename), 'utf-8');
}

export function serveDocMarkdown(slug: string): { content: string; found: boolean } {
  try {
    const { body } = parseFrontmatter(readDocFile(`${slug}.mdx`));
    return { content: body.trim(), found: true };
  } catch {
    return { content: '# Not Found\n\nThis documentation page does not exist.', found: false };
  }
}

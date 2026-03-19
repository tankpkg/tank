import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function resolveDocsDir(): string {
  const devPath = join(process.cwd(), 'public', 'docs');
  if (existsSync(devPath)) return devPath;

  const prodPath = join(process.cwd(), '.output', 'public', 'docs');
  if (existsSync(prodPath)) return prodPath;

  return devPath;
}

const DOCS_DIR = resolveDocsDir();

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
  if (!existsSync(DOCS_DIR)) return [];
  return readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'));
}

export function readDocFile(filename: string): string {
  return readFileSync(join(DOCS_DIR, filename), 'utf-8');
}

export function serveDocMarkdown(slug: string): { content: string; found: boolean } {
  const filename = `${slug}.md`;
  const filepath = join(DOCS_DIR, filename);
  if (!existsSync(filepath)) return { content: '# Not Found\n\nThis documentation page does not exist.', found: false };
  const raw = readFileSync(filepath, 'utf-8');
  const { body } = parseFrontmatter(raw);
  return { content: body, found: true };
}

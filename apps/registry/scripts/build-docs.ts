import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CONTENT_DIR = join(import.meta.dirname, '../content/docs');
const OUTPUT_FILE = join(import.meta.dirname, '../src/generated/docs-bundle.json');

interface RawDoc {
  slug: string;
  title: string;
  description: string;
  body: string;
}

function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep > 0) {
      data[line.slice(0, sep).trim()] = line
        .slice(sep + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
    }
  }
  return { data, body: match[2] };
}

const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'));
const docs: RawDoc[] = [];

for (const file of files) {
  const raw = readFileSync(join(CONTENT_DIR, file), 'utf-8');
  const { data, body } = parseFrontmatter(raw);
  const slug = file.replace(/\.mdx$/, '');
  docs.push({
    slug: slug === 'index' ? '' : slug,
    title: data.title || slug,
    description: data.description || '',
    body: body.trim()
  });
}

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, `${JSON.stringify(docs, null, 2)}\n`);

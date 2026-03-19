import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '../content/docs');
const OUTPUT_FILE = join(__dirname, '../src/generated/docs-bundle.json');

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  const data = {};
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
const docs = [];

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

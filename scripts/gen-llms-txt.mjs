#!/usr/bin/env node
/**
 * Regenerate llms.txt and llms-full.txt from docs content.
 * Run: node scripts/gen-llms-txt.mjs
 *
 * CI will fail if these files are out of sync with docs.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DOCS_DIR = join(ROOT, 'apps/registry/public/docs');
const PUBLIC_DIR = join(ROOT, 'apps/registry/public');

const BASE_URL = 'https://tankpkg.dev';

// Parse MDX frontmatter
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      frontmatter[key.trim()] = valueParts
        .join(':')
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }

  return frontmatter;
}

// Read all MDX files
function readDocs() {
  const docs = [];

  function scanDir(dir, slugPrefix = '') {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, `${slugPrefix}${entry}/`);
      } else if (entry.endsWith('.md') || entry.endsWith('.mdx')) {
        const content = readFileSync(fullPath, 'utf-8');
        const frontmatter = parseFrontmatter(content);
        const slug = entry.replace(/\.mdx?$/, '');
        const bodyContent = content.replace(/^---[\s\S]*?---\r?\n/, '');

        docs.push({
          slug: slug === 'index' ? '' : `${slugPrefix}${slug}`,
          title: frontmatter.title || slug,
          description: frontmatter.description || '',
          content: bodyContent
        });
      }
    }
  }

  scanDir(DOCS_DIR);
  return docs;
}

// Generate llms.txt (curated index)
function generateLlmsTxt(docs) {
  let output = `# Tank Documentation

> Security-first package manager for AI agent skills. Tank provides lockfiles, install-time integrity verification, permission budgets, and a 6-stage security scanning pipeline to reduce supply chain risk.

Tank is a security-first package manager for AI agent skills. It provides versioned installs, lockfiles, permission budgets, and deep scanning before skills reach agents.

## Key Resources

`;

  for (const doc of docs) {
    const url = doc.slug ? `${BASE_URL}/docs/${doc.slug}` : `${BASE_URL}/docs`;
    output += `- [${doc.title}](${url})`;
    if (doc.description) {
      output += `: ${doc.description}`;
    }
    output += '\n';
  }

  output += `
## Optional

- [Skills Registry](${BASE_URL}/skills): Browse all published skills
- [Self-Host Guide](${BASE_URL}/docs/self-hosting): Deploy on your infrastructure

## Constraints

- All skills require explicit permission declarations
- Security scan required before publish (6-stage pipeline)
- Install verifies SHA-512 integrity
- Runtime sandboxing is not yet the enforcement model in this repo

## Full Export

See [llms-full.txt](${BASE_URL}/llms-full.txt) for complete documentation content.
`;

  return output;
}

// Generate llms-full.txt (complete export)
function generateLlmsFullTxt(docs) {
  let output = `# Tank Documentation (Full Export)

This file contains the complete Tank documentation for LLM consumption.

---

`;

  for (const doc of docs) {
    const url = doc.slug ? `${BASE_URL}/docs/${doc.slug}` : `${BASE_URL}/docs`;
    output += `# ${doc.title}\n\n`;
    output += `Source: ${url}\n\n`;
    if (doc.description) {
      output += `> ${doc.description}\n\n`;
    }
    output += doc.content;
    output += '\n\n---\n\n';
  }

  return output;
}

// Main
const docs = readDocs();

const llmsTxt = generateLlmsTxt(docs);
writeFileSync(join(PUBLIC_DIR, 'llms.txt'), llmsTxt);
console.log(`Generated llms.txt with ${docs.length} pages`);

const llmsFullTxt = generateLlmsFullTxt(docs);
writeFileSync(join(PUBLIC_DIR, 'llms-full.txt'), llmsFullTxt);
console.log(`Generated llms-full.txt (${llmsFullTxt.length} chars)`);

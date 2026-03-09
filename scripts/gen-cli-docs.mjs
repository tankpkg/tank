#!/usr/bin/env node
/**
 * Generate CLI reference documentation from source code.
 * Run: node scripts/gen-cli-docs.mjs
 *
 * This script parses the CLI entry point and extracts command definitions,
 * then generates a comprehensive MDX reference page.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CLI_ENTRY = join(ROOT, 'packages/cli/src/bin/tank.ts');
const DOCS_OUTPUT = join(ROOT, 'packages/web/content/docs/cli.mdx');

// Parse CLI entry point and extract commands
function parseCommands(source) {
  const commands = [];

  // Split source into command blocks (each starts with "program\n  .command(")
  const blocks = source.split(/(?=program\s*\n\s*\.command\s*\()/g).filter((b) => b.includes('.command('));

  for (const block of blocks) {
    // Extract command name
    const nameMatch = block.match(/\.command\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    // Extract description
    const descMatch = block.match(/\.description\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    const description = descMatch ? descMatch[1] : '';

    // Extract alias (singular)
    const aliasMatch = block.match(/\.alias\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    const alias = aliasMatch ? [aliasMatch[1]] : [];

    // Extract aliases (plural)
    const aliasesMatch = block.match(/\.aliases\s*\(\s*\[([^\]]+)\]\s*\)/);
    if (aliasesMatch) {
      const aliasStr = aliasesMatch[1];
      const parsed = aliasStr.match(/['"]([^'"]+)['"]/g);
      if (parsed) {
        alias.push(...parsed.map((a) => a.replace(/['"]/g, '')));
      }
    }

    // Extract arguments
    const args = [];
    const argRegex = /\.argument\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"]\s*)?(?:,\s*['"]([^'"]+)['"]\s*)?\)/g;
    let argMatch;
    // biome-ignore lint/suspicious/noAssignInExpressions: regex assignment pattern
    while ((argMatch = argRegex.exec(block)) !== null) {
      args.push({
        name: argMatch[1],
        description: argMatch[2] || '',
        optional: argMatch[1].startsWith('[')
      });
    }

    // Extract options
    const options = [];
    const optRegex = /\.option\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;
    let optMatch;
    // biome-ignore lint/suspicious/noAssignInExpressions: regex assignment pattern
    while ((optMatch = optRegex.exec(block)) !== null) {
      options.push({
        flag: optMatch[1],
        description: optMatch[2]
      });
    }

    commands.push({ name, description, alias, args, options });
  }

  return commands;
}

// Generate MDX documentation
function generateMdx(commands) {
  const frontmatter = `---
title: CLI Reference
description: Complete reference for all ${commands.length} Tank CLI commands — install, publish, search, audit, and manage AI agent skills with security-first design.
---`;

  const intro = `

The Tank CLI provides ${commands.length} commands for publishing, installing, and managing AI agent skills with security-first design.

## Installation

\`\`\`bash
npm install -g @tankpkg/cli
# or
pnpm add -g @tankpkg/cli
\`\`\`

## Global Options

All commands support these options:

| Option | Description |
|--------|-------------|
| \`-h, --help\` | Display help for the command |
| \`-V, --version\` | Display the CLI version |

`;

  const commandSections = commands
    .map((cmd) => {
      let section = `## tank ${cmd.name}\n\n`;
      section += `${cmd.description}\n\n`;

      if (cmd.alias.length > 0) {
        section += `**Aliases:** ${cmd.alias.map((a) => `\`${a}\``).join(', ')}\n\n`;
      }

      section += '```bash\n';
      section += `tank ${cmd.name}`;

      if (cmd.args.length > 0) {
        cmd.args.forEach((arg) => {
          section += ` ${arg.name}`;
        });
      }

      section += '\n```\n\n';

      if (cmd.args.length > 0) {
        section += '### Arguments\n\n';
        section += '| Name | Description | Required |\n';
        section += '|------|-------------|----------|\n';
        cmd.args.forEach((arg) => {
          const name = arg.name.replace(/[[\]<>]/g, '');
          section += `| \`${name}\` | ${arg.description || '-'} | ${arg.optional ? 'No' : 'Yes'} |\n`;
        });
        section += '\n';
      }

      if (cmd.options.length > 0) {
        section += '### Options\n\n';
        section += '| Flag | Description |\n';
        section += '|------|-------------|\n';
        cmd.options.forEach((opt) => {
          section += `| \`${opt.flag}\` | ${opt.description} |\n`;
        });
        section += '\n';
      }

      return section;
    })
    .join('\n');

  const quickRef = `
## Quick Reference

| Command | Alias(es) | Description |
|---------|-----------|-------------|
${commands
  .map((cmd) => {
    const aliases = cmd.alias.length > 0 ? cmd.alias.map((a) => `\`${a}\``).join(', ') : '—';
    return `| \`tank ${cmd.name}\` | ${aliases} | ${cmd.description} |`;
  })
  .join('\n')}

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`TANK_TOKEN\` | API token — overrides \`~/.tank/config.json\` (used in CI/CD) |
| \`TANK_DEBUG=1\` | Enable debug logging (pino → Loki structured logs) |
| \`REGISTRY_URL\` | Override the default registry URL |

## Configuration Files

| File | Purpose |
|------|---------|
| \`~/.tank/config.json\` | Auth token and registry URL (permissions: \`0600\`) |
| \`skills.json\` | Project manifest — skill metadata, dependencies, and permission budget |
| \`skills.lock\` | Deterministic lockfile — pinned versions with SHA-512 hashes |

## Exit Codes

| Code | Meaning |
|------|---------|
| \`0\` | Success |
| \`1\` | General error (invalid arguments, network failure, auth error) |
| \`2\` | Security check failed (\`tank verify\`, \`tank audit\`, or \`tank scan\` with a \`FAIL\` verdict) |
`;

  return `${frontmatter}${intro}${commandSections}${quickRef}`;
}

// Main
const source = readFileSync(CLI_ENTRY, 'utf-8');
const commands = parseCommands(source);
const mdx = generateMdx(commands);

writeFileSync(DOCS_OUTPUT, mdx);
console.log(`Generated CLI docs with ${commands.length} commands to ${DOCS_OUTPUT}`);

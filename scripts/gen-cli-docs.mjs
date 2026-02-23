#!/usr/bin/env node
/**
 * Generate CLI reference documentation from source code.
 * Run: node scripts/gen-cli-docs.mjs
 * 
 * This script parses the CLI entry point and extracts command definitions.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CLI_ENTRY = join(ROOT, 'apps/cli/src/bin/tank.ts');
const DOCS_OUTPUT = join(ROOT, 'apps/web/content/docs/cli.mdx');

// Parse CLI entry point and extract commands
function parseCommands(source) {
  const commands = [];
  
  // Match program.command() blocks with description, arguments, options, and action
  const commandRegex = /program\s*\.\s*command\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.description\s*\(\s*['"]([^'"]+)['"]\s*\)([^;]+)\.action/gs;
  
  let match;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex assignment pattern
  while ((match = commandRegex.exec(source)) !== null) {
    const name = match[1];
    const description = match[2];
    const block = match[3];
    
    // Extract arguments
    const args = [];
    const argRegex = /\.argument\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"]\s*)?(?:,\s*['"]([^'"]+)['"]\s*)?\)/g;
    let argMatch;
    // biome-ignore lint/suspicious/noAssignInExpressions: regex assignment pattern
    while ((argMatch = argRegex.exec(block)) !== null) {
      const argName = argMatch[1];
      const argDesc = argMatch[2] || '';
      args.push({
        name: argName,
        description: argDesc,
        optional: argName.startsWith('['),
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
        description: optMatch[2],
      });
    }
    
    commands.push({
      name,
      description,
      args,
      options,
    });
  }
  
  return commands;
}

// Generate MDX documentation
function generateMdx(commands) {
  const frontmatter = `---
title: CLI Reference
description: Complete reference for all tank CLI commands
---`;

  const intro = `
The Tank CLI provides 16 commands for publishing, installing, and managing AI agent skills with security-first design.

## Installation

\`\`\`bash
npm install -g @tank/cli
# or
pnpm add -g @tank/cli
\`\`\`

## Global Options

All commands support these options:

| Option | Description |
|--------|-------------|
| \`-h, --help\` | Display help for the command |
| \`-V, --version\` | Display the CLI version |

`;

  const commandSections = commands.map(cmd => {
    let section = `## tank ${cmd.name}\n\n${cmd.description}\n\n`;
    section += '```bash\n';
    section += `tank ${cmd.name}`;
    
    if (cmd.args.length > 0) {
      cmd.args.forEach(arg => {
        if (arg.optional) {
          section += ` [${arg.name.replace(/[[\]]/g, '')}]`;
        } else {
          section += ` <${arg.name}>`;
        }
      });
    }
    
    section += '\n```\n\n';
    
    if (cmd.args.length > 0) {
      section += '### Arguments\n\n';
      section += '| Name | Description | Required |\n';
      section += '|------|-------------|----------|\n';
      cmd.args.forEach(arg => {
        const name = arg.name.replace(/[[\]<>]/g, '');
        section += `| \`${name}\` | ${arg.description || '-'} | ${arg.optional ? 'No' : 'Yes'} |\n`;
      });
      section += '\n';
    }
    
    if (cmd.options.length > 0) {
      section += '### Options\n\n';
      section += '| Flag | Description |\n';
      section += '|------|-------------|\n';
      cmd.options.forEach(opt => {
        section += `| \`${opt.flag}\` | ${opt.description} |\n`;
      });
      section += '\n';
    }
    
    return section;
  }).join('\n');

  return `${frontmatter}${intro}${commandSections}`;
}

// Main
const source = readFileSync(CLI_ENTRY, 'utf-8');
const commands = parseCommands(source);
const mdx = generateMdx(commands);

writeFileSync(DOCS_OUTPUT, mdx);
console.log(`Generated CLI docs with ${commands.length} commands to ${DOCS_OUTPUT}`);

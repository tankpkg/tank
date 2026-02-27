#!/usr/bin/env node
/**
 * Generate API reference documentation from Next.js route handlers.
 * Run: node scripts/gen-api-docs.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API_DIR = join(ROOT, 'apps/web/app/api/v1');
const DOCS_OUTPUT = join(ROOT, 'apps/web/content/docs/api.mdx');

// HTTP methods to document
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Parse route file and extract endpoint info
function parseRoute(filePath, basePath) {
  const source = readFileSync(filePath, 'utf-8');
  const endpoints = [];
  
  // Extract route path from file path
  const relativePath = filePath.replace(API_DIR, '').replace('/route.ts', '');
  const routePath = relativePath
    .replace(/\[([^\]]+)\]/g, ':$1')
    .replace(/\[\.\.\.([^\]]+)\]/g, ':$1*');
  
  // Extract method handlers
  METHODS.forEach(method => {
    const methodRegex = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`, 'i');
    if (methodRegex.test(source)) {
      // Try to extract JSDoc comment
      const jsdocRegex = new RegExp(`\\/\\*\\*[\\s\\S]*?\\*\\/\\s*export\\s+async\\s+function\\s+${method}`, 'i');
      const jsdocMatch = source.match(jsdocRegex);
      let description = '';
      
      if (jsdocMatch) {
        const jsdoc = jsdocMatch[0];
        const descMatch = jsdoc.match(/@description\s+(.+)/);
        if (descMatch) {
          description = descMatch[1];
        } else {
          // Extract first line of JSDoc
          const lines = jsdoc.split('\n').filter(l => l.includes('*') && !l.includes('/**'));
          if (lines.length > 0) {
            description = lines[0].replace(/\s*\*\s*/, '').trim();
          }
        }
      }
      
      endpoints.push({
        method: method.toUpperCase(),
        path: `/api/v1${routePath}`,
        description: description || `${method.toUpperCase()} endpoint for ${routePath}`,
      });
    }
  });
  
  return endpoints;
}

// Recursively find all route files
function findRoutes(dir) {
  const routes = [];
  
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      routes.push(...findRoutes(fullPath));
    } else if (entry === 'route.ts') {
      routes.push(fullPath);
    }
  }
  
  return routes;
}

// Generate MDX documentation
function generateMdx(endpoints) {
  const frontmatter = `---
title: API Reference
description: REST API endpoints for Tank registry
---`;

  const intro = `
The Tank API provides programmatic access to the skill registry.

## Authentication

All authenticated endpoints require a Bearer token:

\`\`\`
Authorization: Bearer tank_xxx
\`\`\`

Get your API key from [Settings > Tokens](/settings/tokens).

## Base URL

\`\`\`
https://tankpkg.dev/api/v1
\`\`\`

For self-hosted deployments, replace with your domain.

## Rate Limits

| Tier | Requests/hour |
|------|---------------|
| Anonymous | 100 |
| Authenticated | 1,000 |
| Pro | 10,000 |

`;

  // Group endpoints by resource
  const grouped = {};
  endpoints.forEach(ep => {
    const resource = ep.path.split('/').slice(0, 4).join('/');
    if (!grouped[resource]) {
      grouped[resource] = [];
    }
    grouped[resource].push(ep);
  });

  const sections = Object.entries(grouped).map(([resource, eps]) => {
    let section = `## ${resource}\n\n`;
    
    eps.forEach(ep => {
      section += `### ${ep.method} ${ep.path}\n\n`;
      section += `${ep.description}\n\n`;
      section += '```http\n';
      section += `${ep.method} ${ep.path}\n`;
      section += '```\n\n';
    });
    
    return section;
  }).join('\n');

  return `${frontmatter}${intro}${sections}`;
}

// Main
const routeFiles = findRoutes(API_DIR);
const allEndpoints = routeFiles.flatMap(f => parseRoute(f, API_DIR));
const mdx = generateMdx(allEndpoints);

writeFileSync(DOCS_OUTPUT, mdx);
console.log(`Generated API docs with ${allEndpoints.length} endpoints from ${routeFiles.length} route files`);

#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import { opencodeAdapter } from '../packages/adapters/src/adapters/opencode.js';
import { compilePackage } from '../packages/adapters/src/compile.js';
import { packageIRSchema } from '../packages/internals-schemas/src/schemas/atoms/package.js';

const SKILL_DIR = path.resolve(import.meta.dirname, '../../tank-skills/skills/quality-gate');
const TARGET_DIR = path.resolve(import.meta.dirname, '../../tank-skills');

const manifest = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'tank.json'), 'utf-8'));
const result = packageIRSchema.safeParse(manifest);
if (!result.success) {
  console.error('Invalid manifest:', result.error.issues);
  process.exit(1);
}

const compiled = compilePackage(result.data, opencodeAdapter, { sourceDir: SKILL_DIR });

console.log(
  `\n${compiled.files.length} files, ${compiled.warnings.length} warnings, ${compiled.skipped.length} skipped\n`
);

for (const f of compiled.files) {
  const fullPath = path.join(TARGET_DIR, f.path);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, f.content);
  console.log(`  ✅ ${f.path}`);
}

for (const w of compiled.warnings) {
  console.log(`  ⚠️  [${w.level}] ${w.atomKind}: ${w.message}`);
}

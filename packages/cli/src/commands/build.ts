import fs from 'node:fs';
import path from 'node:path';

import {
  type CompileResult,
  claudeCodeAdapter,
  clineAdapter,
  compilePackage,
  cursorAdapter,
  normalizeDirectory,
  opencodeAdapter,
  rooCodeAdapter,
  windsurfAdapter
} from '@internals/adapters';
import type { PlatformAdapter } from '@internals/schemas';
import ora from 'ora';

import { logger } from '~/lib/logger.js';

const ADAPTERS: Record<string, PlatformAdapter> = {
  opencode: opencodeAdapter,
  'claude-code': claudeCodeAdapter,
  cursor: cursorAdapter,
  windsurf: windsurfAdapter,
  cline: clineAdapter,
  'roo-code': rooCodeAdapter
};

function detectPlatform(): string | null {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.opencode')) || fs.existsSync(path.join(cwd, 'opencode.json'))) return 'opencode';
  if (fs.existsSync(path.join(cwd, '.cursor'))) return 'cursor';
  if (fs.existsSync(path.join(cwd, '.claude'))) return 'claude-code';
  if (fs.existsSync(path.join(cwd, '.windsurf')) || fs.existsSync(path.join(cwd, '.windsurfrules'))) return 'windsurf';
  if (fs.existsSync(path.join(cwd, '.clinerules')) || fs.existsSync(path.join(cwd, '.cline'))) return 'cline';
  if (fs.existsSync(path.join(cwd, '.roo')) || fs.existsSync(path.join(cwd, '.roomodes'))) return 'roo-code';
  return null;
}

function loadManifest(skillDir: string) {
  const result = normalizeDirectory(skillDir);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data;
}

function writeFiles(targetDir: string, compiled: CompileResult): number {
  for (const f of compiled.files) {
    const fullPath = path.join(targetDir, f.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, f.content);
  }
  return compiled.files.length;
}

export interface BuildOptions {
  skill: string;
  target?: string;
  platform?: string;
  out?: string;
  dryRun?: boolean;
  listPlatforms?: boolean;
}

export function listPlatforms(): void {
  logger.info('Available platforms:\n');
  for (const [id, adapter] of Object.entries(ADAPTERS)) {
    const caps = Object.entries(adapter.capabilities)
      .filter(([, v]) => v !== 'none')
      .map(([k]) => k);
    logger.info(`  ${id.padEnd(14)} ${caps.join(', ')}`);
  }
}

export async function buildCommand(opts: BuildOptions): Promise<void> {
  if (opts.listPlatforms) {
    listPlatforms();
    return;
  }

  const spinner = ora('Building...').start();

  try {
    const skillDir = path.resolve(opts.skill);
    if (!fs.existsSync(skillDir)) {
      throw new Error(`Skill directory not found: ${skillDir}`);
    }

    const pkg = loadManifest(skillDir);

    if (!pkg.atoms || pkg.atoms.length === 0) {
      spinner.warn(`${pkg.name} has no atoms — nothing to build`);
      return;
    }

    const platformId = opts.platform ?? detectPlatform();
    if (!platformId) {
      throw new Error(
        'Could not detect platform. Use --platform to specify one of: ' + Object.keys(ADAPTERS).join(', ')
      );
    }

    const adapter = ADAPTERS[platformId];
    if (!adapter) {
      throw new Error(`Unknown platform "${platformId}". Available: ${Object.keys(ADAPTERS).join(', ')}`);
    }

    const targetDir = opts.out ?? opts.target ?? process.cwd();

    spinner.text = `Compiling ${pkg.name} for ${adapter.name}...`;
    const compiled = compilePackage(pkg, adapter, { sourceDir: skillDir });

    if (opts.dryRun) {
      spinner.succeed(`[dry-run] Would write ${compiled.files.length} files for ${adapter.name}`);
      for (const f of compiled.files) {
        logger.info(`  ${f.path}`);
      }
    } else {
      const count = writeFiles(targetDir, compiled);
      spinner.succeed(`Built ${count} files for ${adapter.name}`);
      for (const f of compiled.files) {
        logger.info(`  ${f.path}`);
      }
    }

    for (const w of compiled.warnings) {
      const icon = w.level === 'skipped' ? '⏭️ ' : '⚠️ ';
      logger.warn(`${icon}[${w.atomKind}] ${w.message}`);
    }

    if (compiled.skipped.length > 0) {
      logger.warn(
        `${compiled.skipped.length} atom(s) skipped — ${adapter.name} does not support: ${compiled.skipped.join(', ')}`
      );
    }
  } catch (err) {
    spinner.fail('Build failed');
    throw err;
  }
}

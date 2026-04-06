import fs from 'node:fs';
import path from 'node:path';

import type {
  AdapterCapabilities,
  AtomIR,
  CompilationWarning,
  FileWrite,
  PackageIR,
  PlatformAdapter
} from '@internals/schemas';
import semver from 'semver';

export interface CompileOptions {
  sourceDir?: string;
}

export interface CompileResult {
  files: FileWrite[];
  warnings: CompilationWarning[];
  skipped: string[];
}

const HANDLER_DIRS: Record<string, string> = {
  opencode: '.opencode/plugins/handlers',
  'claude-code': '.claude/hooks',
  cursor: '.cursor/hooks',
  windsurf: '.windsurf/hooks',
  cline: '.clinerules/hooks',
  'roo-code': '.roo/hooks'
};

function resolveSourceFiles(atoms: AtomIR[], sourceDir: string, adapterName: string): FileWrite[] {
  const files: FileWrite[] = [];
  const handlerDir = HANDLER_DIRS[adapterName] ?? `.${adapterName}/hooks`;

  for (const atom of atoms) {
    if (atom.kind === 'hook' && atom.handler.type === 'js') {
      const srcPath = path.resolve(sourceDir, atom.handler.entry);
      if (fs.existsSync(srcPath)) {
        const name = 'name' in atom && atom.name ? atom.name : `hook-${atom.event}`;
        files.push({
          path: `${handlerDir}/${name}.handler.ts`,
          content: fs.readFileSync(srcPath, 'utf-8')
        });
      }
    }

    if (atom.kind === 'instruction') {
      const srcPath = path.resolve(sourceDir, atom.content);
      if (fs.existsSync(srcPath)) {
        files.push({
          path: `__resolved__/${atom.content}`,
          content: fs.readFileSync(srcPath, 'utf-8')
        });
      }
    }

    if (atom.kind === 'prompt' && 'template' in atom) {
      const srcPath = path.resolve(sourceDir, atom.template);
      if (fs.existsSync(srcPath)) {
        files.push({
          path: `__resolved__/${atom.template}`,
          content: fs.readFileSync(srcPath, 'utf-8')
        });
      }
    }
  }

  return files;
}

function inlineFileReferences(files: FileWrite[], resolvedFiles: Map<string, string>): FileWrite[] {
  return files.map((f) => {
    let content = f.content;
    for (const [refPath, refContent] of resolvedFiles) {
      content = content.replace(`{file:${refPath}}`, refContent);
      content = content.replace(`{file:./${refPath}}`, refContent);
    }
    return { path: f.path, content };
  });
}

function deepMergeJson(a: string, b: string): string {
  try {
    const objA = JSON.parse(a);
    const objB = JSON.parse(b);
    const merged = mergeObjects(objA, objB);
    return JSON.stringify(merged, null, 2);
  } catch {
    return b;
  }
}

function mergeObjects(a: unknown, b: unknown): unknown {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const result: Record<string, unknown> = { ...(a as Record<string, unknown>) };
    for (const [key, val] of Object.entries(b as Record<string, unknown>)) {
      if (key in result) {
        result[key] = mergeObjects(result[key], val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }
  return b;
}

function mergeFilesByPath(files: FileWrite[]): FileWrite[] {
  const byPath = new Map<string, FileWrite>();

  for (const f of files) {
    const existing = byPath.get(f.path);
    if (!existing) {
      byPath.set(f.path, f);
      continue;
    }

    if (f.path.endsWith('.json') || f.path === '.roomodes') {
      byPath.set(f.path, { path: f.path, content: deepMergeJson(existing.content, f.content) });
    } else if (f.path.endsWith('.md') || f.path.endsWith('.mdc')) {
      byPath.set(f.path, { path: f.path, content: `${existing.content}\n\n${f.content}` });
    } else {
      byPath.set(f.path, f);
    }
  }

  return [...byPath.values()];
}

export interface PackageResolver {
  resolve(name: string): PackageIR | null;
}

function collectAtoms(pkg: PackageIR, resolver?: PackageResolver, visited?: Set<string>): AtomIR[] {
  const seen = visited ?? new Set<string>();
  if (seen.has(pkg.name)) return [];
  seen.add(pkg.name);

  const atoms: AtomIR[] = [];

  if (pkg.includes) {
    for (const dep of pkg.includes) {
      const resolved = resolver?.resolve(dep);
      if (resolved) {
        atoms.push(...collectAtoms(resolved, resolver, seen));
      }
    }
  }

  atoms.push(...pkg.atoms);
  return atoms;
}

export function compilePackage(
  pkg: PackageIR,
  adapter: PlatformAdapter,
  options?: CompileOptions & { resolver?: PackageResolver }
): CompileResult {
  const rawFiles: FileWrite[] = [];
  const allWarnings: CompilationWarning[] = [];
  const skipped: string[] = [];

  const resolvedContent = new Map<string, string>();

  const allAtomsForResolve = collectAtoms(pkg, options?.resolver);

  if (options?.sourceDir) {
    const sourceFiles = resolveSourceFiles(allAtomsForResolve, options.sourceDir, adapter.name);
    for (const sf of sourceFiles) {
      if (sf.path.startsWith('__resolved__/')) {
        resolvedContent.set(sf.path.replace('__resolved__/', ''), sf.content);
      } else {
        rawFiles.push(sf);
      }
    }
  }

  const allAtoms = collectAtoms(pkg, options?.resolver);

  for (const atom of allAtoms) {
    const capability = adapter.capabilities[atom.kind as keyof AdapterCapabilities];

    if (capability === 'none') {
      const label = 'name' in atom && atom.name ? `${atom.kind}/${atom.name}` : atom.kind;
      allWarnings.push({
        level: 'skipped',
        atomKind: atom.kind,
        message: `${adapter.name} does not support ${atom.kind} — skipped "${label}"`
      });
      skipped.push(atom.kind);
      continue;
    }

    const output = adapter.compileAtom(atom);
    rawFiles.push(...output.files);
    allWarnings.push(...output.warnings);
  }

  const inlined = resolvedContent.size > 0 ? inlineFileReferences(rawFiles, resolvedContent) : rawFiles;
  const merged = mergeFilesByPath(inlined);

  return { files: merged, warnings: allWarnings, skipped };
}

export function checkVersionCompatibility(
  adapter: PlatformAdapter,
  targetVersion: string
): { compatible: boolean; message?: string } {
  if (semver.satisfies(targetVersion, adapter.supportedRange)) {
    return { compatible: true };
  }
  return {
    compatible: false,
    message: `${adapter.name} supports ${adapter.supportedRange}, but target is ${targetVersion}`
  };
}

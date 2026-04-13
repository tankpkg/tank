import fs from 'node:fs';
import path from 'node:path';

import { type PackageIR, packageIRSchema } from '@internals/schemas';

export type NormalizeResult = { success: true; data: PackageIR } | { success: false; error: string };

export function normalizeDirectory(dir: string): NormalizeResult {
  const tankJsonPath = path.join(dir, 'tank.json');
  const skillsJsonPath = path.join(dir, 'skills.json');
  const skillMdPath = path.join(dir, 'SKILL.md');

  const manifestPath = fs.existsSync(tankJsonPath)
    ? tankJsonPath
    : fs.existsSync(skillsJsonPath)
      ? skillsJsonPath
      : null;

  if (!manifestPath) {
    return { success: false, error: 'No tank.json or skills.json found' };
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return { success: false, error: `Failed to parse ${path.basename(manifestPath)}` };
  }

  const hasAtoms = 'atoms' in manifest && Array.isArray(manifest.atoms);
  const hasSkillMd = fs.existsSync(skillMdPath);

  if (!hasAtoms && !hasSkillMd) {
    return { success: false, error: 'No atoms field in manifest and no SKILL.md found' };
  }

  const atoms = hasAtoms ? manifest.atoms : [{ kind: 'instruction', content: 'SKILL.md' }];
  const pkg = { ...manifest, atoms };

  const result = packageIRSchema.safeParse(pkg);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    return { success: false, error: `Invalid manifest:\n${issues}` };
  }

  return { success: true, data: result.data };
}

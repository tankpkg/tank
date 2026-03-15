import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Ajv from 'ajv';
import { afterEach, describe, expect, it } from 'vitest';
import { LOCKFILE_SCHEMA_URL, MANIFEST_SCHEMA_URL } from '../constants/registry.js';
import { buildLockfileSchema, buildManifestSchema, generateVersionedSchemas } from '../lib/schema-generator.js';

describe('schema generator', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('builds manifest and lockfile schema documents with stable ids', () => {
    const manifest = buildManifestSchema();
    const lockfile = buildLockfileSchema();

    expect(manifest.$id).toBe(MANIFEST_SCHEMA_URL);
    expect(lockfile.$id).toBe(LOCKFILE_SCHEMA_URL);
    expect(manifest.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(lockfile.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });

  it('writes versioned schema files to disk', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-schema-gen-'));
    tempDirs.push(outputDir);

    const { manifestPath, lockfilePath } = generateVersionedSchemas(outputDir);

    expect(manifestPath).toBe(path.join(outputDir, 'skills.json'));
    expect(lockfilePath).toBe(path.join(outputDir, 'skills.lock'));
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(lockfilePath)).toBe(true);
  });

  it('validates real fixture files using generated schemas', () => {
    const manifestSchema = buildManifestSchema();
    const lockfileSchema = buildLockfileSchema();

    const fixtureManifest = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), '../../e2e/fixtures/test-skill/skills.json'), 'utf-8')
    ) as Record<string, unknown>;
    const fixtureLockfile = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), '../../e2e/fixtures/test-skill/test/skills.lock'), 'utf-8')
    ) as Record<string, unknown>;

    const ajv = new Ajv({ strict: false, validateFormats: false });
    const validateManifest = ajv.compile(manifestSchema);
    const validateLockfile = ajv.compile(lockfileSchema);

    expect(validateManifest(fixtureManifest)).toBe(true);
    expect(validateLockfile(fixtureLockfile)).toBe(true);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { LOCKFILE_SCHEMA_URL, MANIFEST_SCHEMA_URL } from '../constants/registry.js';
import { skillsJsonSchema } from '../schemas/skills-json.js';
import { skillsLockSchema } from '../schemas/skills-lock.js';

type JsonSchemaDocument = z.core.JSONSchema.BaseSchema;

function buildSchemaDocument(schema: z.ZodType, id: string): JsonSchemaDocument {
  const document = z.toJSONSchema(schema, {
    target: 'draft-7'
  }) as JsonSchemaDocument;
  return {
    ...document,
    $id: id
  };
}

export function buildManifestSchema(): JsonSchemaDocument {
  return buildSchemaDocument(skillsJsonSchema, MANIFEST_SCHEMA_URL);
}

export function buildLockfileSchema(): JsonSchemaDocument {
  return buildSchemaDocument(skillsLockSchema, LOCKFILE_SCHEMA_URL);
}

export function generateVersionedSchemas(outputDir: string): { manifestPath: string; lockfilePath: string } {
  fs.mkdirSync(outputDir, { recursive: true });

  const manifestPath = path.join(outputDir, 'skills.json');
  const lockfilePath = path.join(outputDir, 'skills.lock');

  fs.writeFileSync(manifestPath, JSON.stringify(buildManifestSchema(), null, 2) + '\n');
  fs.writeFileSync(lockfilePath, JSON.stringify(buildLockfileSchema(), null, 2) + '\n');

  return { manifestPath, lockfilePath };
}

import fs from 'node:fs';
import path from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { packageIRSchema } from '../packages/internals-schemas/src/schemas/atoms/package.js';

const jsonSchema = zodToJsonSchema(packageIRSchema as any, {
  name: 'TankJson',
  target: 'jsonSchema7'
});

const root = jsonSchema as Record<string, unknown>;
root.$schema = 'http://json-schema.org/draft-07/schema#';
root.title = 'tank.json';
root.description = 'Tank multi-atom skill package manifest. See https://tankpkg.dev/docs/atoms';

const outPath = path.resolve(import.meta.dirname, '..', 'packages', 'internals-schemas', 'tank-json.schema.json');
fs.writeFileSync(outPath, `${JSON.stringify(jsonSchema, null, 2)}\n`);

console.log(`Generated: ${outPath}`);

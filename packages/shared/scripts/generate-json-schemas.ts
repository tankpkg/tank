import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateVersionedSchemas } from '../src/lib/schema-generator.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, '../../web/public/schemas/v1');

const { manifestPath, lockfilePath } = generateVersionedSchemas(outputDir);

console.log(`Generated schema: ${manifestPath}`);
console.log(`Generated schema: ${lockfilePath}`);

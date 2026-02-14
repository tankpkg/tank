import fs from 'node:fs';
import path from 'node:path';
import { input, confirm } from '@inquirer/prompts';
import { skillsJsonSchema } from '@tank/shared';
import { getConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';

const NAME_PATTERN = /^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
const MAX_NAME_LENGTH = 214;

function validateName(value: string): true | string {
  if (!value) return 'Name must not be empty';
  if (value.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer`;
  if (!NAME_PATTERN.test(value)) return 'Name must be lowercase, alphanumeric + hyphens, optionally scoped (@org/name)';
  return true;
}

function validateVersion(value: string): true | string {
  if (!SEMVER_PATTERN.test(value)) return 'Version must be valid semver (e.g. 1.0.0)';
  return true;
}

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
  const filePath = path.join(cwd, 'skills.json');

  // Check if skills.json already exists
  if (fs.existsSync(filePath)) {
    logger.warn('skills.json already exists in this directory.');
    const overwrite = await confirm({
      message: 'Overwrite existing skills.json?',
      default: false,
    });
    if (!overwrite) {
      logger.info('Aborted.');
      return;
    }
  }

  // Get default author from config
  const config = getConfig();
  const defaultAuthor = config.user?.name ?? '';

  // Prompt for values
  const dirName = path.basename(cwd);

  const name = await input({
    message: 'Skill name:',
    default: dirName,
    validate: validateName,
  });

  const version = await input({
    message: 'Version:',
    default: '0.1.0',
    validate: validateVersion,
  });

  const description = await input({
    message: 'Description:',
    default: '',
  });

  const author = await input({
    message: 'Author:',
    default: defaultAuthor,
  });

  void author;

  const manifest: Record<string, unknown> = {
    name,
    version,
    ...(description ? { description } : {}),
    skills: {},
    permissions: {
      network: { outbound: [] },
      filesystem: { read: [], write: [] },
      subprocess: false,
    },
  };

  // Validate against schema before writing
  const result = skillsJsonSchema.safeParse(manifest);
  if (!result.success) {
    logger.error('Generated skills.json is invalid:');
    for (const issue of result.error.issues) {
      logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    return;
  }

  // Write file
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n');
  logger.success('Created skills.json');
}

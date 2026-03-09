import fs from 'node:fs';
import path from 'node:path';
import { confirm, input } from '@inquirer/prompts';
import { MANIFEST_FILENAME, skillsJsonSchema } from '@internal/shared';
import { getConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { resolveManifestPath } from '../lib/manifest.js';

const NAME_PATTERN = /^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
const MAX_NAME_LENGTH = 214;

export function validateName(value: string): true | string {
  if (!value) return 'Name must not be empty';
  if (value.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer`;
  if (!NAME_PATTERN.test(value)) return 'Name must be lowercase, alphanumeric + hyphens, optionally scoped (@org/name)';
  return true;
}

export function validateVersion(value: string): true | string {
  if (!SEMVER_PATTERN.test(value)) return 'Version must be valid semver (e.g. 1.0.0)';
  return true;
}

export interface InitOptions {
  yes?: boolean;
  name?: string;
  version?: string;
  description?: string;
  private?: boolean;
  force?: boolean;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const resolved = resolveManifestPath(cwd);
  const filePath = resolved.exists ? resolved.path : path.join(cwd, MANIFEST_FILENAME);

  if (options.yes) {
    const dirName = path.basename(cwd);
    const name = options.name ?? dirName;
    const version = options.version ?? '0.1.0';
    const description = options.description ?? '';
    const privateChoice = options.private ?? false;

    const nameResult = validateName(name);
    if (nameResult !== true) {
      logger.error(nameResult);
      return;
    }

    const versionResult = validateVersion(version);
    if (versionResult !== true) {
      logger.error(versionResult);
      return;
    }

    if (resolved.exists) {
      if (!options.force) {
        logger.error(`${path.basename(resolved.path)} already exists. Use --force to overwrite.`);
        return;
      }
    }

    const manifest: Record<string, unknown> = {
      name,
      version,
      ...(description ? { description } : {}),
      visibility: privateChoice ? 'private' : 'public',
      skills: {},
      permissions: {
        network: { outbound: [] },
        filesystem: { read: [], write: [] },
        subprocess: false
      }
    };

    // Validate against schema before writing
    const result = skillsJsonSchema.safeParse(manifest);
    if (!result.success) {
      logger.error(`Generated ${MANIFEST_FILENAME} is invalid:`);
      for (const issue of result.error.issues) {
        logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
      }
      return;
    }

    // Write file
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n');
    logger.success(`Created ${MANIFEST_FILENAME}`);
    return;
  }

  // Check if manifest already exists
  if (resolved.exists) {
    logger.warn(`${path.basename(resolved.path)} already exists in this directory.`);
    const overwrite = await confirm({
      message: `Overwrite existing ${path.basename(resolved.path)}?`,
      default: false
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
    validate: validateName
  });

  const version = await input({
    message: 'Version:',
    default: '0.1.0',
    validate: validateVersion
  });

  const description = await input({
    message: 'Description:',
    default: ''
  });

  const privateChoice = await confirm({
    message: 'Make this skill private?',
    default: name.startsWith('@')
  });

  const author = await input({
    message: 'Author:',
    default: defaultAuthor
  });

  void author;

  const manifest: Record<string, unknown> = {
    name,
    version,
    ...(description ? { description } : {}),
    visibility: privateChoice ? 'private' : 'public',
    skills: {},
    permissions: {
      network: { outbound: [] },
      filesystem: { read: [], write: [] },
      subprocess: false
    }
  };

  // Validate against schema before writing
  const result = skillsJsonSchema.safeParse(manifest);
  if (!result.success) {
    logger.error(`Generated ${MANIFEST_FILENAME} is invalid:`);
    for (const issue of result.error.issues) {
      logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    return;
  }

  // Write file
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n');
  logger.success(`Created ${MANIFEST_FILENAME}`);
}

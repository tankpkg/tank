import fs from 'node:fs';
import path from 'node:path';
import {
  MANIFEST_FILENAME,
  LEGACY_MANIFEST_FILENAME,
  LOCKFILE_FILENAME,
  LEGACY_LOCKFILE_FILENAME
} from '@internal/shared';
import { logger } from '../lib/logger.js';

export interface MigrateOptions {
  directory?: string;
}

export async function migrateCommand(options: MigrateOptions = {}): Promise<void> {
  const dir = options.directory ?? process.cwd();
  let migrated = false;

  // Migrate skills.json → tank.json
  const legacyManifest = path.join(dir, LEGACY_MANIFEST_FILENAME);
  const newManifest = path.join(dir, MANIFEST_FILENAME);

  if (fs.existsSync(newManifest)) {
    logger.info(`${MANIFEST_FILENAME} already exists — skipping manifest migration`);
  } else if (fs.existsSync(legacyManifest)) {
    fs.copyFileSync(legacyManifest, newManifest);
    logger.success(`${LEGACY_MANIFEST_FILENAME} → ${MANIFEST_FILENAME}`);
    migrated = true;
  } else {
    logger.info(`No ${LEGACY_MANIFEST_FILENAME} found — nothing to migrate`);
  }

  // Migrate skills.lock → tank.lock
  const legacyLock = path.join(dir, LEGACY_LOCKFILE_FILENAME);
  const newLock = path.join(dir, LOCKFILE_FILENAME);

  if (fs.existsSync(newLock)) {
    logger.info(`${LOCKFILE_FILENAME} already exists — skipping lockfile migration`);
  } else if (fs.existsSync(legacyLock)) {
    fs.copyFileSync(legacyLock, newLock);
    logger.success(`${LEGACY_LOCKFILE_FILENAME} → ${LOCKFILE_FILENAME}`);
    migrated = true;
  } else {
    logger.info(`No ${LEGACY_LOCKFILE_FILENAME} found — nothing to migrate`);
  }

  if (migrated) {
    logger.info('Old files were kept. Remove them when ready:');
    if (fs.existsSync(legacyManifest) && fs.existsSync(newManifest)) {
      logger.info(`  rm ${LEGACY_MANIFEST_FILENAME}`);
    }
    if (fs.existsSync(legacyLock) && fs.existsSync(newLock)) {
      logger.info(`  rm ${LEGACY_LOCKFILE_FILENAME}`);
    }
    logger.info('If your .gitignore or CI configs reference the old filenames, update them too.');
  } else {
    logger.info('Already migrated — nothing to do');
  }
}

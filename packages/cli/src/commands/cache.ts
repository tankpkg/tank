import fs from "node:fs";
import os from "node:os";
import { getGlobalCacheDir } from "../lib/install-pipeline.js";
import { logger } from "../lib/logger.js";

export interface CacheCleanOptions {
  homedir?: string;
}

export async function cacheCleanCommand(options: CacheCleanOptions = {}): Promise<void> {
  const resolvedHome = options.homedir ?? os.homedir();
  const cacheDir = getGlobalCacheDir(resolvedHome);

  if (!fs.existsSync(cacheDir)) {
    logger.info("Cache is already clean");
    return;
  }

  fs.rmSync(cacheDir, { recursive: true, force: true });
  logger.success("Cache cleaned");
}
